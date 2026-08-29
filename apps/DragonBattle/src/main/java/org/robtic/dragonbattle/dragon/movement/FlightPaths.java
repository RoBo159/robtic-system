package org.robtic.dragonbattle.dragon.movement;

import org.bukkit.Location;
import org.bukkit.entity.EnderDragon;
import org.bukkit.entity.Player;

import java.util.List;
import java.util.Optional;

/**
 * The movement patterns the fight is built from.
 *
 * <h2>None of them knows about altitude</h2>
 *
 * Every position below is computed from something the boss logic supplied — an arena centre, a
 * perch, a player. There is no constant in this file that says how high a dragon flies, because
 * there is no such thing any more: a circle around a point at y=20 is flown at y=20.
 *
 * That is the difference between this and the vanilla behaviour it replaced. Vanilla steers towards
 * a fixed ring of flight nodes generated for the End at roughly y=80, and no phase will leave it.
 *
 * <h2>Static factories rather than public classes</h2>
 *
 * Callers say {@code FlightPaths.dive(at, speed)} and get a {@link FlightPath}. The implementations
 * are private, so a pattern can change shape — gain a phase, lose a parameter — without every call
 * site being a construction of a named type.
 */
public final class FlightPaths {

    private FlightPaths() {
    }

    // ─── Hovering ─────────────────────────────────────────────────────────────────────────────

    /**
     * Holds a fixed point.
     *
     * The default when nothing else is happening, and what a perched dragon uses to stay put — see
     * {@link FlightController}, which still asserts the position every tick so nothing drifts it.
     */
    public static FlightPath hover(Location at, double speed) {
        Location fixed = at.clone();

        return new FlightPath() {
            @Override
            public String name() {
                return "hover";
            }

            @Override
            public Optional<Location> target(EnderDragon dragon, long tick) {
                return Optional.of(fixed);
            }

            @Override
            public double speed() {
                return speed;
            }
        };
    }

    // ─── Travelling ───────────────────────────────────────────────────────────────────────────

    /**
     * Flies to one place and stops.
     *
     * The landing approach, among other things. The destination's Y is used exactly as given, which
     * is what lets a perch at y=20 be landed on — the vanilla approach phase would have refused to
     * descend below its node ring and circled overhead instead.
     *
     * @param arrival how close counts as arrived, in blocks
     */
    public static FlightPath travel(Location to, double speed, double arrival) {
        Location destination = to.clone();
        double arrivalSquared = arrival * arrival;

        return new FlightPath() {
            @Override
            public String name() {
                return "travel";
            }

            @Override
            public Optional<Location> target(EnderDragon dragon, long tick) {
                return Optional.of(destination);
            }

            @Override
            public boolean finished(EnderDragon dragon, long tick) {
                Location at = dragon.getLocation();

                return at.getWorld() != null
                        && at.getWorld().equals(destination.getWorld())
                        && at.distanceSquared(destination) <= arrivalSquared;
            }

            @Override
            public double speed() {
                return speed;
            }
        };
    }

    // ─── Circling ─────────────────────────────────────────────────────────────────────────────

    /**
     * Orbits a point at a fixed radius and height.
     *
     * The state a flying dragon returns to between attacks. The orbit is computed from the centre
     * the boss logic supplied, so an arena whose middle is at y=20 gets a dragon circling at y=20.
     *
     * <h2>A moving target, not a waypoint list</h2>
     *
     * The position is a function of the tick rather than a series of points to visit. The dragon is
     * therefore always chasing a spot slightly ahead of itself, which is what makes the orbit read as
     * banked flight instead of a sequence of corners.
     *
     * @param period how many ticks one full orbit takes
     */
    public static FlightPath circle(Location centre, double radius, long period, double speed, boolean clockwise) {
        Location middle = centre.clone();
        long safePeriod = Math.max(20L, period);
        double direction = clockwise ? 1.0d : -1.0d;

        return new FlightPath() {
            @Override
            public String name() {
                return "circle";
            }

            @Override
            public Optional<Location> target(EnderDragon dragon, long tick) {
                // A quarter turn ahead. Aiming at the point it is currently over would have the
                // dragon perpetually correcting towards a target it has already reached, which reads
                // as hesitation rather than flight.
                double angle = direction * (2.0d * Math.PI * ((tick % safePeriod) / (double) safePeriod))
                        + (Math.PI / 2.0d);

                return Optional.of(middle.clone().add(
                        Math.cos(angle) * radius,
                        0.0d,
                        Math.sin(angle) * radius));
            }

            @Override
            public double speed() {
                return speed;
            }
        };
    }

    // ─── Attacking ────────────────────────────────────────────────────────────────────────────

    /**
     * Flies straight at a point, fast.
     *
     * The dive. Aimed slightly above a player so the dragon passes over them rather than burying
     * itself in the floor — the pass is the attack, and a dragon that stops on top of somebody looks
     * like it has crashed.
     *
     * The target's own Y is used as the basis for that offset, so a dive at a player standing at
     * y=12 happens at y=12. Nothing here has an opinion about how low that is.
     */
    public static FlightPath dive(Location at, double speed, double overshoot) {
        Location aim = at.clone();

        return new FlightPath() {
            @Override
            public String name() {
                return "dive";
            }

            @Override
            public Optional<Location> target(EnderDragon dragon, long tick) {
                return Optional.of(aim);
            }

            @Override
            public boolean finished(EnderDragon dragon, long tick) {
                Location where = dragon.getLocation();

                return where.getWorld() != null
                        && where.getWorld().equals(aim.getWorld())
                        && where.distanceSquared(aim) <= overshoot * overshoot;
            }

            @Override
            public double speed() {
                return speed;
            }
        };
    }

    /**
     * Circles a player at a distance, facing them the whole time.
     *
     * Strafing: the dragon keeps its head on its target while its body moves sideways, which is what
     * makes a breath attack from the air look aimed rather than incidental.
     *
     * The orbit sits at the player's own height plus a standoff, so a fight in a low cavern strafes
     * at cavern height.
     *
     * @param standoff how far above the target to fly
     */
    public static FlightPath strafe(Player target, double radius, double standoff, long period, double speed) {
        long safePeriod = Math.max(20L, period);

        return new FlightPath() {
            @Override
            public String name() {
                return "strafe";
            }

            @Override
            public Optional<Location> target(EnderDragon dragon, long tick) {
                if (!target.isOnline() || target.isDead()) {
                    return Optional.empty();
                }

                double angle = 2.0d * Math.PI * ((tick % safePeriod) / (double) safePeriod);

                return Optional.of(target.getLocation().clone().add(
                        Math.cos(angle) * radius,
                        standoff,
                        Math.sin(angle) * radius));
            }

            @Override
            public boolean finished(EnderDragon dragon, long tick) {
                return !target.isOnline() || target.isDead();
            }

            @Override
            public double speed() {
                return speed;
            }

            @Override
            public boolean faceTravelDirection() {
                return false;
            }

            @Override
            public Optional<Location> lookAt(EnderDragon dragon, long tick) {
                return target.isOnline() ? Optional.of(target.getLocation()) : Optional.empty();
            }
        };
    }

    // ─── Scripted ─────────────────────────────────────────────────────────────────────────────

    /**
     * Flies a fixed list of waypoints in order, then finishes.
     *
     * The seam for a cinematic. A cutscene that wants the dragon to sweep past the camera hands the
     * points here; the dragon flies them exactly, at whatever heights they specify, and the cinematic
     * plugin never has to know how the dragon is moved.
     *
     * @param arrival how close to a waypoint counts as reaching it
     */
    public static FlightPath scripted(List<Location> waypoints, double speed, double arrival) {
        List<Location> points = List.copyOf(waypoints);
        double arrivalSquared = arrival * arrival;

        // Held here rather than recomputed from the dragon's position, so two waypoints in the same
        // place — a deliberate pause in a cutscene — do not collapse into one.
        int[] index = {0};

        return new FlightPath() {
            @Override
            public String name() {
                return "scripted";
            }

            @Override
            public Optional<Location> target(EnderDragon dragon, long tick) {
                if (index[0] >= points.size()) {
                    return Optional.empty();
                }

                Location next = points.get(index[0]);
                Location at = dragon.getLocation();

                if (at.getWorld() != null && at.getWorld().equals(next.getWorld())
                        && at.distanceSquared(next) <= arrivalSquared) {
                    index[0]++;
                    return index[0] < points.size() ? Optional.of(points.get(index[0])) : Optional.empty();
                }

                return Optional.of(next);
            }

            @Override
            public boolean finished(EnderDragon dragon, long tick) {
                return index[0] >= points.size();
            }

            @Override
            public double speed() {
                return speed;
            }
        };
    }
}
