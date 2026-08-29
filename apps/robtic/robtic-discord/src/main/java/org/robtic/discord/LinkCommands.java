package org.robtic.discord;

import com.google.gson.JsonObject;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.api.ApiException;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.config.ServerSettings;
import org.robtic.core.service.PlayerDataService;

import java.util.UUID;
import java.util.logging.Level;

/**
 * `/link` and `/unlink`: connecting a Minecraft account to Discord.
 *
 * Both resolve the player themselves and share one API-failure reporter, which is why they are one
 * executor rather than two nearly identical ones.
 */
public final class LinkCommands implements CommandExecutor {

    private final Plugin plugin;
    private final ServerSettings server;
    private final MessageCatalog messages;
    private final ApiGateway gateway;
    private final PlayerDataService players;

    public LinkCommands(
            Plugin plugin,
            ServerSettings server,
            MessageCatalog messages,
            ApiGateway gateway,
            PlayerDataService players
    ) {
        this.plugin = plugin;
        this.server = server;
        this.messages = messages;
        this.gateway = gateway;
        this.players = players;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("That command can only be run by a player.");
            return true;
        }

        switch (command.getName().toLowerCase()) {
            case "link" -> linkCommand(player);
            case "unlink" -> unlinkCommand(player);
            default -> {
                return false;
            }
        }

        return true;
    }


    /** Issues the one-time code the player redeems with `/minecraft link` on Discord. */
    private void linkCommand(Player player) {
        if (!player.hasPermission("robtic.link")) {
            player.sendMessage(messages.prefixed("staff.no-permission"));
            return;
        }

        gateway.read(
                () -> {
                    if (players.profile(player.getUniqueId(), player.getName()).linked()) {
                        return null;
                    }
                    return players.issueLinkCode(player.getUniqueId(), player.getName());
                },
                (JsonObject issued) -> {
                    if (issued == null) {
                        player.sendMessage(messages.prefixed("link.already-linked"));
                        return;
                    }

                    String code = issued.get("code").getAsString();
                    String minutes = issued.has("minutesValid") ? issued.get("minutesValid").getAsString() : "5";

                    for (var line : messages.lines("link.instructions", "code", code, "minutes", minutes)) {
                        player.sendMessage(line);
                    }
                },
                error -> {
                    // CONFLICT means the API already holds a link for this UUID that the cached
                    // profile above did not know about — that is "already linked", not an outage.
                    if ("CONFLICT".equals(error.code())) {
                        players.invalidate(player.getUniqueId());
                        player.sendMessage(messages.prefixed("link.already-linked"));
                        return;
                    }
                    player.sendMessage(messages.prefixed(reportFailure("/link", player.getName(), error)));
                }
        );
    }

    /**
     * Unlinks this account from Discord.
     *
     * Deliberately only ever unlinks *yourself*: the uuid is taken from the player running it and
     * cannot be aimed at anyone else, so this is not a staff tool and needs no permission beyond
     * the one that let them link in the first place. Staff unlink other people from Discord, where
     * the action is attributable to a Discord account.
     */
    private void unlinkCommand(Player player) {
        if (!player.hasPermission("robtic.link")) {
            player.sendMessage(messages.prefixed("staff.no-permission"));
            return;
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", server.raw().getString("discord.guild-id", ""));
        body.addProperty("uuid", player.getUniqueId().toString());
        body.addProperty("reason", "Unlinked in game by the account holder");

        gateway.read(
                () -> {
                    JsonObject response = gateway.client().post("/api/minecraft/unlink", body);
                    // The cached profile still says linked, and the next read would serve it.
                    players.invalidate(player.getUniqueId());
                    return response;
                },
                response -> player.sendMessage(messages.prefixed("link.unlinked")),
                error -> player.sendMessage(messages.prefixed(
                        "NOT_LINKED".equals(error.code())
                                ? "link.not-linked-yet"
                                : reportFailure("/unlink", player.getName(), error)))
        );
    }

    /**
     * Logs an API failure and picks the message the player sees.
     *
     * Every failure used to surface as "the robs is temporarily unavailable" with nothing in the
     * console, which is indistinguishable from an outage no matter what actually went wrong — a
     * rejected key, a server id the key is not bound to, or a body the API refused. The cause is
     * logged here, once, with the code the API returned, and only a genuinely transient failure is
     * reported to the player as one.
     *
     * @return the message key to send.
     */
    private String reportFailure(String what, String username, ApiException error) {
        if (error.isRetryable()) {
            plugin.getLogger().warning(
                    what + " failed for " + username + ": " + error.code() + " — " + error.getMessage());
            return "robs.unavailable";
        }

        // Not retryable: retrying will fail identically, so this is a configuration fault and is
        // logged loudly enough that an operator finds it without turning debug on.
        plugin.getLogger().log(Level.SEVERE, what + " was rejected by the Robtic API for " + username
                + ": " + error.code() + " (HTTP " + error.status() + ") — " + error.getMessage()
                + ". Check api.yml (url, key, guild-id) and server.id in config.yml against the id "
                + "the key was issued for.");

        return "robs.misconfigured";
    }

}
