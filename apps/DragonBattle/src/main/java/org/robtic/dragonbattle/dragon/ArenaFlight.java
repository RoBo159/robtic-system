package org.robtic.dragonbattle.dragon;

import org.bukkit.Location;
import org.bukkit.entity.EnderDragon;
import org.bukkit.util.Vector;
import org.robtic.dragonbattle.model.Region;

import java.util.Optional;

/**
 * Answers where the arena is, and — as a last resort — puts a displaced dragon back inside it.
 *
 * <h2>This is no longer how the arena is respected</h2>
 *
 * It used to be the whole mechanism. While vanilla owned the dragon's movement there was no way to
 * make it fly low: it steers towards a ring of flight nodes generated for the End at roughly y=80,
 * those nodes are not exposed by any API, and no phase will leave them. The only recourse was to let
 * it fly wherever it liked and drag its position back into the cuboid afterwards, every tick,
 * forever.
 *
 * The movement system replaced that. Every destination the dragon is given is computed from the
 * arena itself — see {@code FlightPaths} — so it is inside the arena because everywhere it is asked
 * to go is inside the arena. That is a much better reason than being pushed back in, and it is what
 * makes an arena at y=20 work rather than merely survivable.
 *
 * <h2>What is left</h2>
 *
 * Two things, both about the arena as a shape rather than about flying:
 *
 * <ul>
 *   <li>{@link #homeFor} — the middle of the arena's volume, which is what the fight circles and
 *       treats as the dragon's home.</li>
 *   <li>{@link #allows} — whether a point is inside, used to reject a perch outside the arena and to
 *       notice a dragon something else has moved.</li>
 * </ul>
 *
 * {@link #confine} remains for that last case only. It is never applied to a destination this plugin
 * chose: the fight's own coordinates are used exactly as given, Y included.
 */
public final class ArenaFlight {

    /**
     * How far inside the walls the dragon's centre is kept.
     *
     * The dragon's hitbox is wide, and clamping its centre exactly to the boundary would leave most
     * of the model outside it. Two blocks is enough that the body stays visibly within the arena
     * without making a small arena unusable.
     */
    private final double margin;

    /**
     * How far outside the box the dragon may drift before it is corrected.
     *
     * Without this the clamp fires on essentially every tick — the dragon's AI pushes up, the clamp
     * pushes down, and the result is a visible jitter at the ceiling. A little slack means the
     * correction happens once per excursion rather than continuously.
     */
    private final double tolerance;

    public ArenaFlight(double margin, double tolerance) {
        this.margin = Math.max(0.0d, margin);
        this.tolerance = Math.max(0.0d, tolerance);
    }

    /**
     * Corrects the dragon's position if it has left the arena.
     *
     * @return true when a correction was applied, which the caller may want to log
     */
    public boolean confine(EnderDragon dragon, Region bounds) {
        Location at = dragon.getLocation();

        if (at.getWorld() == null || !at.getWorld().getName().equals(bounds.world())) {
            return false;
        }

        Location target = clamp(at, bounds);

        // Compared against the tolerance rather than for equality: the clamp returns the same
        // coordinates for a dragon already inside, and a dragon a hand's width outside is not worth
        // interrupting.
        if (at.distanceSquared(target) <= tolerance * tolerance) {
            return false;
        }

        // Facing and motion are preserved. The dragon is being told where it may be, not which way
        // to fly — replacing its yaw here would make every correction look like a stumble.
        target.setYaw(at.getYaw());
        target.setPitch(at.getPitch());

        dragon.teleport(target);

        // Velocity into the wall is removed on the axes that were clamped. Left alone, the dragon
        // arrives back inside still carrying the momentum that took it out, and is corrected again
        // on the next tick — the jitter the tolerance above exists to avoid.
        dragon.setVelocity(withoutOutwardMotion(dragon.getVelocity(), at, target));

        return true;
    }

    /** The nearest position inside the arena, on all three axes. */
    private Location clamp(Location at, Region bounds) {
        // The block maxima are inclusive, so the usable space extends to max + 1 before the margin
        // is taken off. Ignoring that would lose a block of arena on each of the three upper faces.
        return new Location(
                at.getWorld(),
                clamp(at.getX(), bounds.minX(), bounds.maxX() + 1.0d),
                clamp(at.getY(), bounds.minY(), bounds.maxY() + 1.0d),
                clamp(at.getZ(), bounds.minZ(), bounds.maxZ() + 1.0d));
    }

    /**
     * Clamps one axis into {@code [low + margin, high - margin]}.
     *
     * An arena thinner than twice the margin collapses to its own centre rather than producing an
     * inverted range — which would otherwise clamp the dragon to a point outside the arena, on the
     * wrong side of it.
     */
    private double clamp(double value, double low, double high) {
        double min = low + margin;
        double max = high - margin;

        if (min >= max) {
            return (low + high) / 2.0d;
        }

        return Math.max(min, Math.min(max, value));
    }

    /** Strips the components of a velocity that point out of the arena. */
    private static Vector withoutOutwardMotion(Vector velocity, Location from, Location to) {
        Vector kept = velocity.clone();

        if (from.getX() != to.getX()) {
            kept.setX(0);
        }
        if (from.getY() != to.getY()) {
            kept.setY(0);
        }
        if (from.getZ() != to.getZ()) {
            kept.setZ(0);
        }

        return kept;
    }

    /**
     * Where the dragon should consider home.
     *
     * <h2>Why the podium must be inside the arena</h2>
     *
     * The podium is what the dragon circles and what it returns to when it has nothing else to do.
     * Vanilla puts it at the exit portal, which in the End is high up — so a dragon given the vanilla
     * podium spends the fight climbing back towards it, and an arena with a low ceiling fights the
     * dragon's own navigation on every tick.
     *
     * Pointing it at the middle of the arena's own volume is what removes the vanilla height
     * assumption at its source, rather than only correcting the symptom afterwards.
     */
    public static Optional<Location> homeFor(org.bukkit.World world, Region bounds) {
        if (world == null || !world.getName().equals(bounds.world())) {
            return Optional.empty();
        }

        return Optional.of(new Location(
                world,
                (bounds.minX() + bounds.maxX() + 1) / 2.0d,
                // The vertical middle, not the floor. A podium on the floor of a tall arena has the
                // dragon hugging the ground; one in the middle gives it the whole volume to use.
                (bounds.minY() + bounds.maxY() + 1) / 2.0d,
                (bounds.minZ() + bounds.maxZ() + 1) / 2.0d));
    }

    /**
     * Whether a point is somewhere the dragon may fly to.
     *
     * Used before a landing is committed to: a perch outside the arena would send the dragon through
     * a wall this class then drags it back through.
     */
    public boolean allows(Location location, Region bounds) {
        return location.getWorld() != null
                && location.getWorld().getName().equals(bounds.world())
                && location.getX() >= bounds.minX() && location.getX() <= bounds.maxX() + 1.0d
                && location.getY() >= bounds.minY() && location.getY() <= bounds.maxY() + 1.0d
                && location.getZ() >= bounds.minZ() && location.getZ() <= bounds.maxZ() + 1.0d;
    }
}
