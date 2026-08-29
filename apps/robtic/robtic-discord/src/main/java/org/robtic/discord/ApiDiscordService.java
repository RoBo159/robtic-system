package org.robtic.discord;

import com.google.gson.JsonObject;
import org.bukkit.plugin.Plugin;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.discord.DiscordEmbed;
import org.robtic.core.discord.DiscordService;
import org.robtic.core.model.PlayerProfile;
import org.robtic.core.service.PlayerDataService;

import java.util.Optional;
import java.util.UUID;

/**
 * Discord, reached through the Robtic API.
 *
 * <h2>There is no Discord library anywhere in this project</h2>
 *
 * Not here, and not in any other plugin. This one holds no gateway connection, no JDA, no webhook
 * client. What it does is hand a message to {@code /api/discord/send} and let the bot — a separate
 * TypeScript service that is the only thing actually connected to Discord — deliver it.
 *
 * That is worth stating plainly because the plugin is called RobticDiscord and the obvious
 * assumption is wrong. The benefit is real: one bot holds one connection for the whole network, so
 * five Minecraft servers do not become five gateway sessions competing for the same rate limit, and
 * a Minecraft server restarting does not churn a Discord connection.
 *
 * <h2>Nothing here blocks the caller</h2>
 *
 * Every send is queued through {@link ApiGateway}, which means two things: it is off the main thread,
 * and it survives an outage. A jail logged while the API is unreachable is replayed when it comes
 * back rather than lost — which matters more for a moderation log than for a chat relay, and costs
 * nothing to apply to both.
 */
public final class ApiDiscordService implements DiscordService {

    private final Plugin plugin;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final PlayerDataService players;

    public ApiDiscordService(
            Plugin plugin,
            ApiGateway gateway,
            ApiSettings api,
            PlayerDataService players
    ) {
        this.plugin = plugin;
        this.gateway = gateway;
        this.api = api;
        this.players = players;
    }

    @Override
    public void sendMessage(String channelId, String message) {
        if (blank(channelId) || blank(message)) {
            return;
        }

        JsonObject body = base(channelId);
        body.addProperty("content", message);

        deliver("/api/discord/send", body, "message");
    }

    @Override
    public void sendEmbed(String channelId, DiscordEmbed embed) {
        if (blank(channelId) || embed == null) {
            return;
        }

        JsonObject body = base(channelId);
        body.add("embed", embed.toJson());

        deliver("/api/discord/send", body, "embed");
    }

    @Override
    public void assignRole(UUID player, String roleId) {
        role(player, roleId, true);
    }

    @Override
    public void removeRole(UUID player, String roleId) {
        role(player, roleId, false);
    }

    /**
     * Grants or removes a role.
     *
     * The Discord id is resolved from the cached profile rather than sent as a Minecraft UUID: the
     * bot would have to look it up anyway, and doing it here means an unlinked player costs nothing
     * instead of a round trip that comes back "not linked".
     */
    private void role(UUID player, String roleId, boolean grant) {
        if (player == null || blank(roleId)) {
            return;
        }

        Optional<String> discordId = discordIdOf(player);

        if (discordId.isEmpty()) {
            // Not an error. Most players are not linked, and a role for an unlinked account is
            // simply not applicable.
            return;
        }

        JsonObject body = new JsonObject();

        body.addProperty("guildId", api.guildId());
        body.addProperty("discordId", discordId.get());
        body.addProperty("roleId", roleId);
        body.addProperty("grant", grant);

        deliver("/api/discord/role", body, grant ? "role grant" : "role removal");
    }

    @Override
    public boolean isLinked(UUID player) {
        return players.cached(player).map(PlayerProfile::linked).orElse(false);
    }

    /**
     * The linked Discord id, from cache only.
     *
     * Never fetches. This is called from role synchronisation and from log lines, both of which run
     * often enough that a request per call would be a problem, and both of which are better off
     * doing nothing than blocking.
     */
    @Override
    public Optional<String> discordIdOf(UUID player) {
        return players.cached(player)
                .filter(PlayerProfile::linked)
                .map(PlayerProfile::discordId)
                .filter(id -> !blank(id));
    }

    /**
     * Whether the API is currently reachable.
     *
     * The honest answer to "will this arrive": the bot's own connection to Discord is not visible
     * from here, so this reports the hop this plugin actually controls. A caller deciding whether to
     * queue work wants this; a caller sending a log line does not need to ask, because the gateway
     * queues it either way.
     */
    @Override
    public boolean available() {
        return gateway.isAvailable();
    }

    private JsonObject base(String channelId) {
        JsonObject body = new JsonObject();

        body.addProperty("guildId", api.guildId());
        body.addProperty("serverId", api.serverId());
        body.addProperty("channelId", channelId);

        return body;
    }

    /**
     * Queues a request, with a stable id so a replay cannot double-post.
     *
     * The id is derived from the endpoint and the moment rather than being random: a retry of the
     * same queued request carries the same id, and the API rejects the duplicate. Without that, an
     * outage that queued fifty log lines would post each of them twice on recovery.
     */
    private void deliver(String endpoint, JsonObject body, String what) {
        String requestId = ApiGateway.requestIdFor(
                endpoint, UUID.randomUUID(), System.currentTimeMillis());

        body.addProperty("requestId", requestId);

        try {
            gateway.deliver(endpoint, body, requestId);
        } catch (RuntimeException failure) {
            // FINE: a Discord send that does not arrive must never be louder than the thing it was
            // reporting. The gateway has already logged the outage itself.
            plugin.getLogger().fine("Could not queue a Discord " + what + ": " + failure.getMessage());
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
