package org.robtic.core.staff;

import java.util.UUID;

/**
 * What a moderator acting from Discord can do to this server.
 *
 * <h2>This interface is the last of the monolith's four dependency cycles</h2>
 *
 * {@code service} ↔ {@code staff} was a cycle because the bridge consumer — the thing that reads
 * instructions arriving from Discord — called straight into the freeze, jail and staff-chat
 * services, while those same services called back into the API layer the bridge lived in.
 *
 * In the split, that same shape would be RobticDiscord importing RobticStaff. Three methods do not
 * justify one feature plugin depending on another, and it would mean a server that runs Discord
 * integration without a moderation plugin fails to load rather than simply doing less.
 *
 * So the three calls are here. RobticStaff registers an implementation; RobticDiscord resolves one
 * and ignores the instructions it cannot carry out. Neither imports the other.
 *
 * <h2>Deliberately only the remote actions</h2>
 *
 * Freezing somebody <em>in game</em> goes through RobticStaff's own command and never through this.
 * What is modelled here is exclusively "Discord says this already happened, bring the server into
 * line" — which is why the methods are named for applying a state rather than for performing an
 * action, and why none of them return a result. The decision was made elsewhere.
 */
public interface ModerationBridge {

    /**
     * Shows a message that was sent in the Discord staff channel.
     *
     * @param username the Discord display name, already resolved — this server has no way to look
     *                 one up
     */
    void showStaffChatFromDiscord(String username, String message);

    /**
     * Brings a player's jail state into line with what Discord reports.
     *
     * @param jailed whether they should be jailed
     * @param reason shown to the player; may be null when releasing
     */
    void applyJailState(UUID player, boolean jailed, String reason);

    /**
     * Brings a player's freeze state into line with what Discord reports.
     *
     * @param frozen whether they should be frozen
     * @param reason shown to the player; may be null when unfreezing
     */
    void applyFreezeState(UUID player, boolean frozen, String reason);

    /**
     * What happens when no moderation plugin is installed: nothing.
     *
     * A server running the Discord bridge without RobticStaff still relays chat and still links
     * accounts. It simply cannot act on a moderation instruction, which is the correct outcome —
     * there is nothing on this server that could have produced one either.
     */
    ModerationBridge NONE = new ModerationBridge() {

        @Override
        public void showStaffChatFromDiscord(String username, String message) {
        }

        @Override
        public void applyJailState(UUID player, boolean jailed, String reason) {
        }

        @Override
        public void applyFreezeState(UUID player, boolean frozen, String reason) {
        }
    };
}
