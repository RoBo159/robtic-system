package org.robtic.minecraft.license.gui;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.license.LicenseService;
import org.robtic.minecraft.license.config.LicenseSettings;

/**
 * Runs every click in the licence browser.
 *
 * <h2>Everything is cancelled</h2>
 *
 * Clicks are cancelled before anything else happens, including clicks on empty slots and clicks in
 * the player's own inventory while the menu is open. A menu that lets an item be dragged into it is
 * a menu that eats items, and shift-clicking from the lower inventory is the usual way that is
 * discovered — which for a menu opened while carrying licences would be a very expensive bug.
 *
 * <h2>The renewal runs off the tick</h2>
 *
 * Charging crosses a network. Doing it inline would hold the main thread for the length of an HTTP
 * request while a player watched a frozen menu, so the payment happens on a worker and the item is
 * rewritten on the tick afterwards — the same shape as every other paid action in this plugin.
 */
public final class LicenseBrowserListener implements Listener {

    private final Plugin plugin;
    private final LicenseService licenses;
    private final LicenseBrowser browser;
    private final MessageCatalog messages;

    private volatile LicenseSettings settings;

    /**
     * Players with a renewal in flight.
     *
     * A renewal is a network round trip, and a second click arrives long before the first finishes.
     * Without this guard that is two charges for one renewal — and unlike a duplicated read, money
     * taken twice cannot be reconciled by looking at the data afterwards.
     */
    private final java.util.Set<java.util.UUID> renewing =
            java.util.concurrent.ConcurrentHashMap.newKeySet();

    public LicenseBrowserListener(
            Plugin plugin,
            LicenseService licenses,
            LicenseBrowser browser,
            MessageCatalog messages,
            LicenseSettings settings
    ) {
        this.plugin = plugin;
        this.licenses = licenses;
        this.browser = browser;
        this.messages = messages;
        this.settings = settings;
    }

    public void settings(LicenseSettings replacement) {
        this.settings = replacement;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onClick(InventoryClickEvent event) {
        if (!(event.getInventory().getHolder() instanceof LicenseBrowserHolder holder)) {
            return;
        }

        // Cancelled unconditionally, before any dispatch. Covers decoration, empty slots, and
        // shift-clicks originating in the player's own inventory.
        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        holder.actionAt(event.getRawSlot()).ifPresent(action -> dispatch(player, holder, action));
    }

    /** Dragging across menu slots is another way to move items into one. */
    @EventHandler(priority = EventPriority.HIGH)
    public void onDrag(InventoryDragEvent event) {
        if (event.getInventory().getHolder() instanceof LicenseBrowserHolder) {
            event.setCancelled(true);
        }
    }

    private void dispatch(Player player, LicenseBrowserHolder holder, LicenseBrowserHolder.Action action) {
        switch (action) {
            case LicenseBrowserHolder.Action.Close ignored -> player.closeInventory();

            case LicenseBrowserHolder.Action.Filter filter ->
                    browser.open(player, filter.categoryId(), 0);

            case LicenseBrowserHolder.Action.Page page ->
                    browser.open(player, holder.categoryId(), page.page());

            // Inspecting is deliberately a no-op beyond the lore already on the item. Everything a
            // detail screen would show is on the entry the player is hovering, and a second screen
            // to repeat it would be a click that costs the player their place in the list.
            case LicenseBrowserHolder.Action.Inspect ignored -> {
            }

            case LicenseBrowserHolder.Action.Renew renew -> renew(player, holder, renew.licenseId());
        }
    }

    private void renew(Player player, LicenseBrowserHolder holder, String licenseId) {
        if (!renewing.add(player.getUniqueId())) {
            return;
        }

        String category = holder.categoryId();
        int page = holder.page();

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            LicenseService.RenewResult result;

            try {
                result = licenses.renew(player, licenseId);
            } catch (RuntimeException failure) {
                // An economy that throws must not leave the guard held, or this player could never
                // renew anything again until a restart.
                result = LicenseService.RenewResult.ECONOMY_UNAVAILABLE;

                plugin.getLogger().warning("A licence renewal failed for " + player.getName()
                        + ": " + failure.getMessage());
            }

            LicenseService.RenewResult outcome = result;

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                renewing.remove(player.getUniqueId());

                if (!player.isOnline()) {
                    return;
                }

                report(player, licenseId, outcome);

                // Reopened where they were, so a player renewing several licences in a filtered
                // category is not sent back to the top of the list each time.
                browser.open(player, category, page);
            });
        });
    }

    private void report(Player player, String licenseId, LicenseService.RenewResult result) {
        String name = licenses.definition(licenseId).map(license -> license.display()).orElse(licenseId);

        switch (result) {
            case SUCCESS -> {
                player.sendMessage(messages.prefixed("license.renewed", "license", name));

                settings.renewSound().ifPresent(sound ->
                        player.playSound(player.getLocation(), sound, 0.8f, 1.2f));

                if (settings.particlesOnRenew()) {
                    player.getWorld().spawnParticle(org.bukkit.Particle.HAPPY_VILLAGER,
                            player.getLocation().add(0, 1, 0), 12, 0.4, 0.6, 0.4, 0.02);
                }
            }
            case NOT_HELD -> deny(player, "license.renew-not-held", name);
            case NOT_RENEWABLE -> deny(player, "license.renew-not-renewable", name);
            case PERMANENT -> deny(player, "license.renew-permanent", name);
            case CANNOT_AFFORD -> deny(player, "license.renew-cannot-afford", name);
            case ECONOMY_UNAVAILABLE -> deny(player, "license.renew-unavailable", name);
        }
    }

    private void deny(Player player, String key, String name) {
        player.sendMessage(messages.prefixed(key, "license", name));

        settings.deniedSound().ifPresent(sound ->
                player.playSound(player.getLocation(), sound, 0.6f, 0.8f));
    }
}
