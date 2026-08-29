package org.robtic.core.license;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.license.api.License;
import org.robtic.core.license.api.LicenseRegistry;
import org.robtic.core.license.citizens.LicenseNpcHook;
import org.robtic.core.license.citizens.LicenseNpcStore;
import org.robtic.core.license.commands.LicenseCommand;
import org.robtic.core.license.config.LicenseSettings;
import org.robtic.core.license.gui.LicenseBrowser;
import org.robtic.core.license.gui.LicenseBrowserListener;
import org.robtic.core.license.hooks.LicensePlaceholders;
import org.robtic.core.license.hooks.LicenseStatistics;
import org.robtic.core.license.item.LicenseItemFactory;
import org.robtic.core.license.item.LicenseSignature;
import org.robtic.core.statistics.StatisticsService;
import org.robtic.core.util.Robs;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * Builds and owns the licence system.
 *
 * <h2>The composition root for one module</h2>
 *
 * Everything below is constructor injection: no service looks up another, nothing is static, and the
 * dependency direction is visible on one screen. That is what makes the stated goal — this becoming
 * its own plugin, or being depended on by other plugins — a matter of moving a package rather than
 * reconstructing a boot sequence.
 *
 * <h2>What this module depends on</h2>
 *
 * A {@link Plugin}, a {@link MessageCatalog}, a config supplier, and optionally a
 * {@link StatisticsService} and a {@link LicenseEconomy}. Not jobs, not workspaces, not the survival
 * module. Both optional dependencies degrade rather than fail: without statistics nothing is
 * counted, without an economy nothing can be renewed, and the rest works.
 *
 * <h2>Cache invalidation is a listener, not a timer</h2>
 *
 * A licence is the item, so anything that moves an item changes who owns what. The events below are
 * the cheap, complete set: a click, a drop, a pickup, an inventory closing. Each drops one player's
 * cached scan and costs a map removal.
 */
public final class LicenseSystem implements Listener {

    private final Plugin plugin;
    private final Supplier<FileConfiguration> config;
    private final MessageCatalog messages;

    private final LicenseRegistry registry;
    private final LicenseService service;
    private final LicenseNpcStore npcs;
    private final LicenseBrowser browser;
    private final LicenseBrowserListener browserListener;

    private volatile LicenseSettings settings;

    /** Absent on a server without Citizens. Re-resolved on reload, so installing it needs a restart
     *  but enabling it during one does not. */
    private volatile Optional<LicenseNpcHook> citizens = Optional.empty();

    public LicenseSystem(
            Plugin plugin,
            MessageCatalog messages,
            Supplier<FileConfiguration> config
    ) {
        this.plugin = plugin;
        this.messages = messages;
        this.config = config;

        this.settings = new LicenseSettings(
                config.get().getConfigurationSection("licenses"), plugin.getLogger());

        this.registry = new LicenseRegistry(plugin.getLogger());

        LicenseSignature signatures = new LicenseSignature(
                plugin.getDataFolder().toPath().resolve("licenses.key"), plugin.getLogger());

        LicenseItemFactory items =
                new LicenseItemFactory(plugin, registry, signatures, this::renderLore);

        this.service = new LicenseService(plugin, registry, items);
        this.npcs = new LicenseNpcStore(plugin);
        this.browser = new LicenseBrowser(service, messages, settings);

        this.browserListener =
                new LicenseBrowserListener(plugin, service, browser, messages, settings);
    }

    /** The API every other system uses. The only thing outside this package anybody should hold. */
    public LicenseService service() {
        return service;
    }

    public LicenseSettings settings() {
        return settings;
    }

    public String name() {
        return "licenses";
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────────────────────

    public void enable() {
        loadConfiguration();

        if (!settings.enabled()) {
            plugin.getLogger().info("Licences are switched off in licenses.yml. Nothing is issued or"
                    + " checked; items players already hold are untouched and work again when it is"
                    + " switched back on.");
            return;
        }

        npcs.load();

        plugin.getServer().getPluginManager().registerEvents(this, plugin);
        plugin.getServer().getPluginManager().registerEvents(browserListener, plugin);

        this.citizens = LicenseNpcHook.createIfPresent(plugin, npcs, browser);

        if (citizens.isEmpty()) {
            plugin.getLogger().info("Citizens is not installed, so licence NPCs are unavailable."
                    + " Everything else works; players use /license.");
        }

        registerCommand();

        plugin.getLogger().info("Licences enabled: " + registry.size() + " licence(s) in "
                + registry.categories().size() + " category/categories"
                + (citizens.isPresent() ? ", " + npcs.size() + " NPC(s)" : "")
                + (service.economy().available() ? "" : " — no economy, renewals unavailable") + ".");
    }

    /**
     * Re-reads {@code licenses.yml}.
     *
     * Definitions are rebuilt from the file and code registrations replayed on top. No item is
     * touched by any of it: a reload changes what a licence <em>means</em>, never what a player
     * holds.
     */
    public void reload() {
        loadConfiguration();

        browser.settings(settings);
        browserListener.settings(settings);
    }

    private void loadConfiguration() {
        this.settings = new LicenseSettings(
                config.get().getConfigurationSection("licenses"), plugin.getLogger());

        // Cleared and rebuilt rather than diffed. A diff would have to decide what to do about a
        // definition that vanished from the file while players were carrying it — and the answer is
        // "nothing", which is what clearing the registry and leaving the items alone does.
        registry.clear();

        settings.categories().forEach(registry::register);
        int accepted = registry.registerAll(settings.licenses());

        // Code registrations last, so a plugin's definition wins over a config entry with the same
        // id. The plugin knows what its own code expects; the file is a server's customisation.
        service.replayCodeRegistrations();

        if (accepted < settings.licenses().size()) {
            plugin.getLogger().warning("licenses.yml defined " + settings.licenses().size()
                    + " licence(s), of which " + accepted + " were accepted.");
        }
    }

    private void registerCommand() {
        var command = plugin.getServer().getPluginCommand("license");

        if (command == null) {
            plugin.getLogger().warning("The command \"license\" is not declared in plugin.yml,"
                    + " so it will not work.");
            return;
        }

        LicenseCommand executor = new LicenseCommand(
                plugin, service, browser, npcs, messages, this::reload, () -> citizens);

        command.setExecutor(executor);
        command.setTabCompleter(executor);
    }

    /** Wires the statistics bridge. Optional: without it nothing is counted and everything works. */
    public void statistics(StatisticsService statistics) {
        if (statistics != null) {
            new LicenseStatistics(statistics).register(service);
        }
    }

    /** Wires the economy. Without it renewals are refused rather than silently free. */
    public void economy(LicenseEconomy economy) {
        service.economy(economy);
    }

    /** The placeholder extension, for registering with the plugin's existing expansion. */
    public LicensePlaceholders placeholders() {
        return new LicensePlaceholders(service);
    }

    // ─── Item lore ────────────────────────────────────────────────────────────────────────────

    /**
     * Builds the lore on a licence item.
     *
     * Lives here rather than in the item factory so the wording comes from {@code messages.yml} — a
     * server that wants different phrasing, or another language, changes configuration. The factory
     * owns the item's *shape*; this owns its words.
     */
    private List<String> renderLore(License license, LicenseItemFactory.Holding holding) {
        List<String> lore = new ArrayList<>();
        long now = System.currentTimeMillis();

        license.description().forEach(lore::add);

        if (!license.description().isEmpty()) {
            lore.add("");
        }

        lore.add(messages.text("license.item.category",
                "category", registry.category(license.categoryId()).display()));
        lore.add(messages.text("license.item.rarity", "rarity", license.rarity()));
        lore.add("");

        if (holding.permanent()) {
            lore.add(messages.text("license.item.status-permanent"));
        } else if (holding.expired(now)) {
            lore.add(messages.text("license.item.status-expired",
                    "when", LicenseItemFactory.date(holding.expiresAt())));
        } else {
            lore.add(messages.text("license.item.status-valid"));
            lore.add(messages.text("license.item.expires",
                    "when", LicenseItemFactory.date(holding.expiresAt())));
            lore.add(messages.text("license.item.remaining",
                    "remaining", LicenseItemFactory.describe(
                            java.time.Duration.ofMillis(Math.max(0L, holding.expiresAt() - now)))));
        }

        if (license.canRenew() && !license.permanent()) {
            lore.add("");
            lore.add(messages.text("license.item.renewal-cost",
                    "cost", Robs.format(license.renewalCost())));
            lore.add(messages.text("license.item.renewal-period",
                    "period", LicenseItemFactory.describe(license.renewalPeriod())));
        }

        if (!license.acquisition().isEmpty()) {
            lore.add("");
            lore.add(messages.text("license.item.how-to-obtain"));
            license.acquisition().forEach(line ->
                    lore.add(messages.text("license.item.bullet", "text", line)));
        }

        lore.add("");
        lore.add(messages.text("license.item.footer"));

        return lore;
    }

    // ─── Cache invalidation ───────────────────────────────────────────────────────────────────
    //
    // Ownership is the item, so anything that moves one changes the answer. Each of these drops one
    // player's cached scan; the next question rebuilds it.

    @EventHandler(priority = EventPriority.MONITOR)
    public void onDrop(PlayerDropItemEvent event) {
        service.invalidate(event.getPlayer().getUniqueId());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onPickup(EntityPickupItemEvent event) {
        if (event.getEntity() instanceof org.bukkit.entity.Player player) {
            service.invalidate(player.getUniqueId());
        }
    }

    /**
     * An inventory closing.
     *
     * Covers the ender chest and every container a licence could have been moved into or out of, in
     * one handler — far cheaper than reacting to each click inside them.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onClose(InventoryCloseEvent event) {
        service.invalidate(event.getPlayer().getUniqueId());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        service.forget(event.getPlayer().getUniqueId());
    }

    public void disable() {
        // Nothing to save. Licences live on items, the NPC list is written when it changes, and the
        // signing key is written when it is created — there is deliberately no shutdown state.
    }
}
