package org.robtic.minecraft.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.config.ApiSettings;

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
     */
    public void push(FileConfiguration config, FileConfiguration roles, FileConfiguration prices,
                     org.robtic.minecraft.config.PremiumSettings premium) {
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
        body.add("logTargets", pairs(config, "discord.log-actions", "action", "channelId"));
        body.add("roleMappings", pairs(roles, "mappings", "roleId", "group"));
        body.add("prices", prices(prices));

        // Premium is the one thing Discord owns, so the tiers travel with the rest of the config
        // and the API resolves each player's entitlements from them.
        body.add("premiumTiers", premiumTiers(premium));
        body.addProperty("freeHomeLimit", premium.freeHomeLimit());
        body.addProperty("backWindowMs", premium.backWindowMillis());

        try {
            client.post("/api/server/settings", body);
            logger.info("Pushed this server's configuration to the Robtic API.");
        } catch (ApiException error) {
            // Not fatal. The API keeps the last document it was given, so the server runs on the
            // previous configuration rather than on none.
            logger.log(Level.WARNING, "Could not push configuration to the Robtic API: "
                    + error.code() + " — " + error.getMessage() + ". The API will keep using the "
                    + "configuration it already has.");
        }
    }

    /** The premium ladder, in the shape the API's document uses. */
    private static com.google.gson.JsonArray premiumTiers(org.robtic.minecraft.config.PremiumSettings premium) {
        com.google.gson.JsonArray array = new com.google.gson.JsonArray();

        for (org.robtic.minecraft.config.PremiumSettings.Tier tier : premium.tiers()) {
            JsonObject entry = new JsonObject();
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
            array.add(entry);
        }

        return array;
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
