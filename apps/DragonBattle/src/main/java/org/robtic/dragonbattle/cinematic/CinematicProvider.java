package org.robtic.dragonbattle.cinematic;

import org.bukkit.entity.Player;

import java.util.List;

/**
 * Whatever actually plays a cinematic.
 *
 * <h2>Why this is an interface rather than a call to CS Cinematic</h2>
 *
 * CS Cinematic is the plugin this ships configured for, and the brief asks for its API in preference
 * to its command. It does not publish one: the plugin documents `/cs play <name> [player]` and
 * nothing else — no maven artifact, no javadoc, no class names. Writing reflection against class and
 * method names guessed from a feature list would compile perfectly and fail on a live server, which
 * is worse than not attempting it, because a reflective miss looks identical to a missing plugin.
 *
 * So the shipped implementation is {@link CommandCinematicProvider}, driving the documented command.
 * This interface exists so that adding a real API binding later is one new class and one line in
 * {@link CinematicService} — not a rewrite of everything that triggers a cinematic.
 *
 * <h2>Contract</h2>
 *
 * Every method runs on the main thread. Nothing here may throw: a cutscene is decoration, and a
 * failure to play one must never touch the battle it decorates. Implementations report a problem by
 * returning false and are expected to have logged it themselves.
 */
public interface CinematicProvider {

    /** Short lowercase name, for the enable log line. */
    String name();

    /**
     * Whether the backing plugin is present and usable right now.
     *
     * Checked before every play rather than cached at boot, because a plugin manager can enable or
     * disable a plugin at runtime and a cached answer would be wrong in exactly the case an operator
     * is trying to diagnose.
     */
    boolean available();

    /**
     * Plays a named cinematic.
     *
     * @param cinematic the operator's own name for it, exactly as it exists in the cinematics plugin
     * @param viewers   who should see it. May be empty, which means "however the provider decides" —
     *                  for a command with its own selector, that is the correct case rather than a
     *                  reason to do nothing
     * @return whether it was dispatched. False means the caller should carry on regardless
     */
    boolean play(String cinematic, List<Player> viewers, Context context);

    /**
     * What the cinematic is being played for.
     *
     * Passed as a value rather than as separate arguments so a future provider can use the arena or
     * the trigger — a per-arena camera, say — without every call site changing shape.
     *
     * @param trigger the configured key that fired, e.g. {@code dragon_spawn}
     * @param arena   the arena's name
     * @param world   the world the arena's dragon spawns in, or empty when it is not loaded
     */
    record Context(String trigger, String arena, String world) {
    }
}
