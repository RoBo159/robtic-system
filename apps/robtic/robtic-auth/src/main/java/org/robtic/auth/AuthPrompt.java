package org.robtic.auth;

import org.bukkit.entity.Player;

/**
 * A surface that can ask a player to authenticate.
 *
 * <h2>Why this is an interface with one implementation today</h2>
 *
 * Minecraft has more than one way to take text from a player, and which of them works depends on the
 * client rather than on the server: a Java client on a recent Paper build can be shown a native
 * dialog, a Bedrock client reaching the server through Geyser cannot, and an older Java client
 * cannot either. The decision therefore has to be made per player, at the moment of asking, which
 * means the surfaces have to be interchangeable.
 *
 * {@link AuthPromptRouter} picks; implementations do not know about each other, and a new one is
 * added by writing a class rather than by editing a chain of conditionals.
 *
 * <h2>The last one in the chain must never say no</h2>
 *
 * A router that runs out of options leaves a player unable to authenticate at all — restricted,
 * unable to speak, unable to leave. So the inventory surface answers {@link #supports} with true
 * unconditionally, and every surface offered ahead of it is free to be picky.
 */
public interface AuthPrompt {

    /** Whether this surface will work for this particular player, right now. */
    boolean supports(Player player);

    /**
     * Asks the player to authenticate. Main thread only.
     *
     * What is asked depends on their state — a password, a recovery code, or instructions to link —
     * which the implementation reads from {@link AuthService#stateOf}. It is not a parameter because
     * the state can change between being told to prompt and prompting, and the freshest answer is
     * always the right one.
     */
    void show(Player player);

    /** A short name for the console, so an operator can see which surface a player was given. */
    String name();
}
