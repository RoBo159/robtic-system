package org.robtic.core.auth;

import java.util.UUID;

/**
 * Account events that reach this server from Discord.
 *
 * <h2>Why the direction matters</h2>
 *
 * Every method here reports something that has <em>already happened</em> elsewhere: somebody linked
 * their account on Discord, changed their password on the website, or unlinked. The server is being
 * told, not asked. That is why nothing returns a result and nothing can be refused.
 *
 * <h2>Why the contract is in Core</h2>
 *
 * RobticDiscord receives the events; RobticAuth acts on them. Neither may import the other —
 * RobticAuth already depends on RobticDiscord for verification, so a call in the other direction
 * would close a cycle between two feature plugins, which is the thing the whole split was for.
 *
 * So Discord resolves this and delivers what it receives. With no RobticAuth installed nothing is
 * registered, the events are ignored, and the bridge carries on relaying chat.
 */
public interface AuthBridge {

    /**
     * A Minecraft account has been linked to a Discord account.
     *
     * @param hasPassword whether the account already has a password set, which decides whether the
     *                    player is asked to create one or to log in
     */
    void onLinked(UUID player, String discordId, boolean hasPassword);

    /**
     * A linked account's password has changed.
     *
     * @param authenticate whether this should also count as logging the player in — true when the
     *                     change was made by the player themselves and they are waiting in game
     */
    void onPasswordChanged(UUID player, boolean authenticate);

    /** A Minecraft account has been unlinked, and can no longer authenticate. */
    void onUnlinked(UUID player);
}
