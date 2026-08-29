package org.robtic.core.discord;

import java.util.Optional;
import java.util.UUID;

/**
 * What a plugin can ask Discord to do.
 *
 * <h2>No plugin knows how Discord is reached</h2>
 *
 * Including RobticDiscord's callers. This interface says <em>what</em> — send this, grant that — and
 * never how. Today the implementation posts to the Robtic API and a bot elsewhere does the talking;
 * if that were ever replaced with a direct gateway connection, nothing outside RobticDiscord would
 * change.
 *
 * That is not a hypothetical benefit. It is what makes the rule "no feature plugin imports a Discord
 * library" enforceable rather than aspirational: there is nothing to import, because the only type
 * that crosses the boundary is this one.
 *
 * <h2>Absent means silent, never broken</h2>
 *
 * A server without RobticDiscord resolves {@link #NONE}. Every method succeeds and does nothing,
 * every query answers empty. A plugin that logs an action to Discord on every jail does not need a
 * branch around each call — the call is simply free.
 *
 * <h2>Everything here is fire-and-forget</h2>
 *
 * No method blocks and none returns a delivery result, because none can honestly: the message is
 * handed to the API and delivered by a bot on its own schedule. A caller that needs to know whether
 * something arrived is asking a question this seam cannot answer, and should not be shaped around
 * pretending otherwise.
 */
public interface DiscordService {

    /**
     * Sends plain text to a channel.
     *
     * @param channelId the Discord channel id. A blank or unconfigured id is dropped silently — an
     *                  operator who has not set a channel has turned that feature off, and warning
     *                  per message would be the console spam this ecosystem avoids
     */
    void sendMessage(String channelId, String message);

    /**
     * Sends an embed.
     *
     * @param embed built with {@link DiscordEmbed#builder}, so a caller never assembles Discord's
     *              own JSON shape
     */
    void sendEmbed(String channelId, DiscordEmbed embed);

    /**
     * Grants a Discord role to whoever this Minecraft account is linked to.
     *
     * Does nothing when the account is not linked — which is the common case and not an error.
     */
    void assignRole(UUID player, String roleId);

    /** Removes a Discord role. Does nothing when the account is not linked. */
    void removeRole(UUID player, String roleId);

    /** Whether this Minecraft account is linked to a Discord account. */
    boolean isLinked(UUID player);

    /** The linked Discord user id, or empty when the account is not linked. */
    Optional<String> discordIdOf(UUID player);

    /**
     * Whether Discord is actually reachable.
     *
     * Distinct from "is a service registered": {@link #NONE} answers false, and so does a real
     * implementation whose API is currently down. A caller deciding whether to <em>queue</em> work
     * wants this; a caller just sending a log line does not need to ask.
     */
    boolean available();

    /**
     * The implementation used when RobticDiscord is not installed.
     *
     * Deliberately not null and deliberately not a thrown exception. Every consumer resolves this
     * through {@code RobticServices.findOr(DiscordService.class, DiscordService.NONE)} and then
     * writes one code path whether or not the plugin exists.
     */
    DiscordService NONE = new DiscordService() {

        @Override
        public void sendMessage(String channelId, String message) {
        }

        @Override
        public void sendEmbed(String channelId, DiscordEmbed embed) {
        }

        @Override
        public void assignRole(UUID player, String roleId) {
        }

        @Override
        public void removeRole(UUID player, String roleId) {
        }

        @Override
        public boolean isLinked(UUID player) {
            return false;
        }

        @Override
        public Optional<String> discordIdOf(UUID player) {
            return Optional.empty();
        }

        @Override
        public boolean available() {
            return false;
        }
    };
}
