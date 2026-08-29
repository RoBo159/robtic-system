package org.robtic.core.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.robtic.core.api.ApiClient;
import org.robtic.core.api.ApiException;
import org.robtic.core.config.ApiSettings;

import java.util.Locale;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Publishes this server's configuration to the API.
 *
 * <h2>Which way the configuration flows</h2>
 *
 * Outwards, from these files to Discord — not the other way round. Channels, toggles, role
 * mappings, the jail role and the price table are all edited here and pushed on startup and on
 * `/robtic reload`; the bot reads what was pushed. The `/minecraft config` and `/minecraft price`
 * slash commands that used to own these settings are gone, because two writers to the same
 * settings is precisely the arrangement that produced a plugin and an API disagreeing about what
 * was configured, with no indication which one an operator should have edited.
 *
 * <h2>What is deliberately not pushed</h2>
 *
 * The API key. It is issued on Discord with `/minecraft apikey create` and typed into api.yml,
 * because a credential that could be set by whoever already holds it would not be a credential.
 *
 * <h2>Failure</h2>
 *
 * A failed push is logged and otherwise ignored. The API keeps whatever it was last given, so a
 * server that cannot reach the API on boot runs on the previous configuration rather than losing
 * it — and the next reload or restart pushes again.
 */
public final class ConfigPushService {

    private final ApiClient client;
    private final ApiSettings api;
    private final Logger logger;

    public ConfigPushService(ApiClient client, ApiSettings api, Logger logger) {
        this.client = client;
        this.api = api;
        this.logger = logger;
    }

    /**
     * Builds and sends the document. Must run off the main thread.
     *
     * @param config config.yml, for the discord section
     * @param roles  roles.yml, for the mappings and the jail role
     * @param prices prices.yml, for the exchange table
     * @param contributions one per plugin that has something to say — see DiscordDocument
     *
     * <h2>Why the document is assembled rather than read</h2>
     *
     * Core owns the guild, the bridge channels and the price table, and nothing else in here. The
     * premium ladder is RobticPremium's; the moderation log routes are RobticStaff's. A plugin that
     * owns no premium settings cannot be the one that serialises them, so each owner contributes its
     * own section and a plugin that is not installed contributes nothing — which is the correct
     * answer for the API, because that server genuinely has no such channel.
     */
    public void push(FileConfiguration config, FileConfiguration roles, FileConfiguration prices,
                     java.util.List<org.robtic.core.discord.DiscordDocument> contributions) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        body.addProperty("statusChannelId", channel(config, "discord.status-channel"));
        body.addProperty("chatChannelId", channel(config, "discord.chat-channel"));
        body.addProperty("staffChatChannelId", channel(config, "discord.staff-channel"));
        body.addProperty("defaultLogChannelId", channel(config, "discord.log-channel"));

        body.addProperty("chatBridgeEnabled", config.getBoolean("discord.chat-bridge", true));
        body.addProperty("roleSyncEnabled", config.getBoolean("discord.role-sync", true));
        body.addProperty("staffSystemEnabled", config.getBoolean("discord.staff-system", true));

        body.addProperty("jailRoleId", roles.getString("jail-role-id", "").trim());
        body.add("logTargets", logTargets(config, contributions));
        body.add("roleMappings", pairs(roles, "mappings", "roleId", "group"));
        body.add("prices", prices(prices));

        // Each contributor's own keys, merged flat rather than nested — the document the API
        // receives has to be byte-identical to the one the monolith sent.
        java.util.List<String> contributors = new java.util.ArrayList<>();

        for (org.robtic.core.discord.DiscordDocument document : contributions) {
            JsonObject extra = document.extra();

            if (extra != null) {
                extra.entrySet().forEach(entry -> body.add(entry.getKey(), entry.getValue()));
            }

            contributors.add(document.name());
        }

        try {
            client.post("/api/server/settings", body);
            logger.info("Pushed this server's configuration to the Robtic API"
                    + (contributors.isEmpty() ? "." : " (with " + String.join(", ", contributors) + ")."));
        } catch (ApiException error) {
            // Not fatal. The API keeps the last document it was given, so the server runs on the
            // previous configuration rather than on none.
            logger.log(Level.WARNING, "Could not push configuration to the Robtic API: "
                    + error.code() + " — " + error.getMessage() + ". The API will keep using the "
                    + "configuration it already has.");
        }
    }


    /** A channel id, or an empty string. Blank means "this feature is off", not "unset". */
    private static String channel(FileConfiguration config, String path) {
        return config.getString(path, "").trim();
    }

    /**
     * A flat `key: value` section as an array of objects.
     *
     * YAML maps read more naturally in a config file than lists of pairs; the API wants the
     * array shape its documents already use, so the translation happens here rather than forcing
     * one side's convenience on the other.
     */
    /**
     * Log routing, merged from Core's own config and every contributing plugin.
     *
     * <h2>Core's entries come first and lose</h2>
     *
     * The legacy {@code discord.log-actions} map in config.yml is read first, then each plugin's
     * routes are applied over it. That ordering is deliberate: after the migration a plugin owns its
     * action IDs, and an entry left behind in the old central map must not override the owner.
     *
     * A route claimed by two plugins is a real conflict — two owners for one action — and is named
     * rather than silently resolved.
     */
    private JsonArray logTargets(
            FileConfiguration config,
            java.util.List<org.robtic.core.discord.DiscordDocument> contributions
    ) {
        java.util.Map<String, String> routes = new java.util.LinkedHashMap<>();
        java.util.Map<String, String> owners = new java.util.LinkedHashMap<>();

        var legacy = config.getConfigurationSection("discord.log-actions");

        if (legacy != null) {
            for (String action : legacy.getKeys(false)) {
                String channel = legacy.getString(action, "");

                if (channel != null && !channel.isBlank()) {
                    routes.put(action, channel.trim());
                    owners.put(action, "config.yml");
                }
            }
        }

        for (org.robtic.core.discord.DiscordDocument document : contributions) {
            document.logChannels().forEach((action, channel) -> {
                String previous = owners.put(action, document.name());

                if (previous != null && !previous.equals("config.yml")) {
                    logger.warning("Two plugins route the Discord log action \"" + action
                            + "\": " + previous + " and " + document.name()
                            + ". " + document.name() + " wins. Remove one of them.");
                }

                routes.put(action, channel);
            });
        }

        JsonArray array = new JsonArray();

        routes.forEach((action, channel) -> {
            JsonObject entry = new JsonObject();
            entry.addProperty("action", action);
            entry.addProperty("channelId", channel);
            array.add(entry);
        });

        return array;
    }

    private static JsonArray pairs(FileConfiguration config, String path, String keyName, String valueName) {
        JsonArray array = new JsonArray();
        ConfigurationSection section = config.getConfigurationSection(path);
        if (section == null) {
            return array;
        }

        for (String key : section.getKeys(false)) {
            String value = section.getString(key, "").trim();
            if (key.isBlank() || value.isBlank()) {
                continue;
            }

            JsonObject entry = new JsonObject();
            entry.addProperty(keyName, key.trim());
            entry.addProperty(valueName, value);
            array.add(entry);
        }

        return array;
    }

    /** The price table. An entry with no positive price is skipped rather than pushed as zero. */
    private static JsonArray prices(FileConfiguration prices) {
        JsonArray array = new JsonArray();
        ConfigurationSection section = prices.getConfigurationSection("prices");
        if (section == null) {
            return array;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection entry = section.getConfigurationSection(key);
            if (entry == null) {
                continue;
            }

            // `coins` is the pre-robs key. Still read so an existing prices.yml keeps working
            // through the rename instead of silently pushing an empty price table.
            int unitPrice = entry.getInt("robs", entry.getInt("coins", 0));
            if (unitPrice <= 0) {
                continue;
            }

            JsonObject price = new JsonObject();
            price.addProperty("itemKey", key.trim().toUpperCase(Locale.ROOT));
            price.addProperty("price", unitPrice);
            price.addProperty("enabled", entry.getBoolean("enabled", true));
            array.add(price);
        }

        return array;
    }
}
