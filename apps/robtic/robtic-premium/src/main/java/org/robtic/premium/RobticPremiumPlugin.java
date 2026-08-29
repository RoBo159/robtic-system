package org.robtic.premium;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.robtic.core.entitlement.EntitlementService;
import org.robtic.core.entitlement.EntitlementSource;
import org.robtic.core.entitlement.Entitlements;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;
import org.robtic.core.service.PermissionSyncService;
import org.robtic.core.service.RobticServices;
import org.robtic.premium.config.PremiumSettings;

import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.OptionalInt;
import java.util.UUID;
import java.util.logging.Level;

/**
 * RobticPremium: tiers, and the entitlements that raise other plugins' limits.
 *
 * <h2>Premium is not a feature set</h2>
 *
 * There is no such thing as a "premium command" in this ecosystem, and that is deliberate. Premium
 * is a tier that raises limits on features other plugins own: how many homes may be set, how many
 * {@code /back} uses are granted, how many chests may be locked, whether the ender chest is portable,
 * whether cosmetics are available, and — later — how many workspaces may be claimed.
 *
 * Moving {@code /back} or {@code /particle} into this plugin would delete them for free players,
 * which is why they stayed in RobticEssentials. What lives here is the tier definitions, the group
 * synchronisation, and the answer to "what is this player entitled to".
 *
 * <h2>Nothing depends on this plugin</h2>
 *
 * It registers {@link EntitlementService}; Core registers a do-nothing implementation of the same
 * interface at startup, so a server without RobticPremium has every player at tier zero and every
 * feature falling back to its own free defaults. Removing this jar costs premium perks and nothing
 * else.
 *
 * <h2>And this plugin depends on no feature plugin either</h2>
 *
 * The entitlement values come from the API, cached by whoever already fetches player data on join —
 * RobticEssentials, in practice. This plugin reads them through Core's {@link EntitlementSource}
 * rather than importing Essentials, so the two are siblings rather than a chain.
 */
public final class RobticPremiumPlugin extends RobticPlugin {

    private PremiumSettings settings;
    private PremiumSyncService sync;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(
                PluginDependency.required("RobticCore"),
                PluginDependency.optional("LuckPerms",
                        "premium tiers cannot be applied as permission groups"),
                PluginDependency.optional("RobticEssentials",
                        "nothing caches player entitlements, so no tier can be resolved"));
    }

    @Override
    protected void start() {
        settings = new PremiumSettings(read("premium.yml"));

        PermissionSyncService permissions = RobticServices.find(PermissionSyncService.class)
                .orElseThrow(() -> new IllegalStateException(
                        "RobticCore did not register PermissionSyncService."));

        EntitlementSource source = RobticServices.find(EntitlementSource.class).orElse(null);

        if (source == null) {
            // One line, and then the plugin runs on. The tier definitions are still published
            // through EntitlementService below, so a limit lookup still gets an answer — there is
            // simply nothing feeding it live values.
            getLogger().warning("No plugin is caching player entitlements, so premium groups will"
                    + " not be applied. RobticEssentials normally provides this.");
        } else {
            sync = new PremiumSyncService(this, permissions, settings, source);

            getServer().getPluginManager().registerEvents(new JoinListener(), this);
        }

        // This plugin's section of the configuration document Core pushes to the API. Core owns the
        // push; this plugin owns premium.yml, so the tier ladder is built here and handed over.
        RobticServices.register(this, org.robtic.core.discord.DiscordDocument.class,
                new org.robtic.core.discord.DiscordDocument() {

                    @Override
                    public String name() {
                        return "premium";
                    }

                    @Override
                    public com.google.gson.JsonObject extra() {
                        return premiumDocument();
                    }
                });

        // The answer other plugins ask for. Replaces Core's do-nothing default because it is
        // registered at a higher priority — see RobticServices#registerPreferred.
        RobticServices.registerPreferred(this, EntitlementService.class, new TierEntitlements(source));

        startDiscord();

        getLogger().info("RobticPremium ready: " + settings.tiers().size() + " tier(s).");
    }

    /**
     * Applies a player's premium group when they join.
     *
     * This plugin owns the listener rather than RobticEssentials calling in, which is what lets a
     * server drop this jar and keep a working join sequence.
     */
    private final class JoinListener implements Listener {

        @EventHandler
        public void onJoin(PlayerJoinEvent event) {
            UUID uuid = event.getPlayer().getUniqueId();

            // Asynchronous: the entitlement lookup may have to reach the API, and a join must not
            // wait on it. The group is applied a moment after the player is in the world.
            getServer().getScheduler().runTaskAsynchronously(RobticPremiumPlugin.this,
                    () -> sync.apply(uuid));
        }

        // No quit handler: the entitlement cache belongs to whoever registered the source and is
        // evicted there. Invalidating from here would be a second plugin managing a cache it does
        // not own, and the two would eventually disagree about who is still loaded.
    }

    /**
     * Answers entitlement questions from whatever is cached, falling back to the configured free
     * limits.
     *
     * <h2>Empty is not zero</h2>
     *
     * A limit nobody has an opinion about returns empty, and the caller applies its own free default.
     * Returning zero would tell RobticEssentials that a player may set zero homes, which is the bug
     * {@link EntitlementService} was shaped to prevent.
     */
    private final class TierEntitlements implements EntitlementService {

        private final EntitlementSource source;

        private TierEntitlements(EntitlementSource source) {
            this.source = source;
        }

        private Entitlements held(UUID player) {
            return source == null
                    ? Entitlements.free(settings.freeHomeLimit())
                    : source.cachedFor(player);
        }

        @Override
        public int tier(UUID player) {
            return held(player).level();
        }

        @Override
        public OptionalInt limit(UUID player, String key) {
            Entitlements entitlements = held(player);

            return switch (key) {
                case "homes" -> OptionalInt.of(entitlements.homeLimit());
                case "back-uses" -> OptionalInt.of(entitlements.backUses());
                case "locked-chests" -> OptionalInt.of(entitlements.lockedChestLimit());
                // Anything this plugin has no opinion about — workspaces, professions, whatever a
                // future plugin invents — falls through to the caller's own default.
                default -> OptionalInt.empty();
            };
        }

        @Override
        public boolean allows(UUID player, String feature) {
            Entitlements entitlements = held(player);

            return switch (feature) {
                case "cosmetics" -> entitlements.cosmetics();
                case "portable-chest" -> entitlements.portableChest();
                default -> false;
            };
        }
    }

    /** The premium keys, in the shape the API's configuration document expects. */
    private com.google.gson.JsonObject premiumDocument() {
        com.google.gson.JsonObject document = new com.google.gson.JsonObject();
        com.google.gson.JsonArray tiers = new com.google.gson.JsonArray();

        for (PremiumSettings.Tier tier : settings.tiers()) {
            com.google.gson.JsonObject entry = new com.google.gson.JsonObject();

            entry.addProperty("id", tier.id());
            entry.addProperty("name", tier.name());
            entry.addProperty("level", tier.level());
            entry.addProperty("discordRoleId", tier.discordRoleId());
            entry.addProperty("luckPermsGroup", tier.group());
            entry.addProperty("homeLimit", tier.homeLimit());
            entry.addProperty("backUses", tier.backUses());
            entry.addProperty("lockedChestLimit", tier.lockedChestLimit());
            entry.addProperty("portableChest", tier.portableChest());
            entry.addProperty("cosmetics", tier.cosmetics());

            tiers.add(entry);
        }

        document.add("premiumTiers", tiers);
        document.addProperty("freeHomeLimit", settings.freeHomeLimit());
        document.addProperty("backWindowMs", settings.backWindowMillis());

        return document;
    }

    /** Never null: resolves to a do-nothing integration when Discord is off or absent. */
    private org.robtic.core.discord.DiscordIntegration discord;

    /**
     * This plugin's optional Discord integration.
     *
     * Off by default. Everything this plugin does works identically without RobticDiscord installed
     * — Discord only ever adds a copy of something that already happened.
     */
    private void startDiscord() {
        org.robtic.core.discord.DiscordSettings settings =
                org.robtic.core.discord.DiscordSettings.parse(
                        read("premium.yml").getConfigurationSection("discord"), "premium.yml", getLogger());

        discord = org.robtic.core.discord.DiscordIntegration.resolve(this, settings);

        org.robtic.core.service.RobticServices.register(this,
                org.robtic.core.discord.DiscordDocument.class,
                new org.robtic.core.discord.DiscordDocument() {

                    @Override
                    public String name() {
                        return "premium";
                    }

                    @Override
                    public java.util.Map<String, String> logChannels() {
                        return org.robtic.core.discord.DiscordSettings.parse(
                                read("premium.yml").getConfigurationSection("discord"),
                                "premium.yml", getLogger()).channels().isEmpty()
                                ? java.util.Map.of()
                                : routes();
                    }
                });
    }

    /** The configured routes, read fresh so a reload takes effect without a restart. */
    private java.util.Map<String, String> routes() {
        var section = read("premium.yml").getConfigurationSection("discord.log-actions");

        if (section == null) {
            return java.util.Map.of();
        }

        java.util.Map<String, String> routes = new java.util.LinkedHashMap<>();

        for (String action : section.getKeys(false)) {
            String channel = section.getString(action, "");

            if (channel != null && !channel.isBlank()) {
                routes.put(action, channel.trim());
            }
        }

        return routes;
    }

    private FileConfiguration read(String name) {
        File file = new File(getDataFolder(), name);

        if (!file.exists()) {
            saveResource(name, false);
        }

        FileConfiguration configuration = YamlConfiguration.loadConfiguration(file);

        try (var stream = getResource(name)) {
            if (stream != null) {
                configuration.setDefaults(YamlConfiguration.loadConfiguration(
                        new InputStreamReader(stream, StandardCharsets.UTF_8)));
                configuration.options().copyDefaults(true);
            }
        } catch (Exception error) {
            getLogger().log(Level.WARNING, "Could not merge defaults for " + name, error);
        }

        return configuration;
    }

    public PremiumSettings settings() {
        return settings;
    }
}
