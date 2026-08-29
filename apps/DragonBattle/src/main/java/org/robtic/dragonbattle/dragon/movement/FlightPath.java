package org.robtic.dragonbattle.dragon.movement;

import org.bukkit.Location;
import org.bukkit.entity.EnderDragon;

import java.util.Optional;

/**
 * Where the dragon should be heading, right now.
 *
 * <h2>The whole movement system is this one question</h2>
 *
 * A path is asked, every tick, for a position. {@link FlightController} steers towards whatever it
 * says and nothing else decides where the dragon goes — there is no vanilla navigation left in the
 * loop, and therefore no altitude the dragon prefers. A path returning y=10 is flown to at y=10.
 *
 * <h2>Adding an attack pattern</h2>
 *
 * A new pattern is a new implementation of this interface and nothing else. Dive, circle, strafe,
 * hover, travel and scripted are the ones shipped — see {@link FlightPaths} — and a future one
 * (spiral, feint, pursue, retreat) plugs in the same way without touching the controller, the battle
 * machine, or the dragon.
 *
 * <h2>Contract</h2>
 *
 * Called on the main thread, once per battle tick, for as long as the path is active. It must be
 * cheap: this runs for every dragon in every running fight. It must not move the dragon itself —
 * that is the controller's job, and a path that teleported would be fighting the thing steering it.
 */
public interface FlightPath {

    /** Short lowercase name, for debug output. */
    String name();

    /**
     * Where the dragon should be heading.
     *
     * @return the destination, in world coordinates, exactly as the boss logic intends it. The
     *         controller does not clamp or adjust it — in particular it never touches the Y — so a
     *         path is responsible for producing somewhere the dragon should genuinely be.
     *         Empty means "hold position", which is how a path pauses without ending
     */
    Optional<Location> target(EnderDragon dragon, long tick);

    /**
     * Whether this path has run its course.
     *
     * A circle never finishes; a dive finishes when it reaches its target. The caller decides what
     * happens next, so a finished path simply stops being asked.
     */
    default boolean finished(EnderDragon dragon, long tick) {
        return false;
    }

    /**
     * How fast to travel along it, in blocks per tick.
     *
     * Per path rather than one global speed, because a dive and a patrol are not the same movement:
     * a dive that crawled would not read as an attack, and a patrol at dive speed would look
     * frantic.
     */
    double speed();

    /**
     * Whether the dragon should face the way it is travelling.
     *
     * True for almost everything. False for a path that wants to control facing itself — a strafing
     * run keeps the dragon's head on its target while it moves sideways, which is the whole point of
     * strafing.
     */
    default boolean faceTravelDirection() {
        return true;
    }

    /**
     * What the dragon should be looking at, when it is not looking where it is going.
     *
     * Only consulted when {@link #faceTravelDirection()} is false.
     */
    default Optional<Location> lookAt(EnderDragon dragon, long tick) {
        return Optional.empty();
    }
}
