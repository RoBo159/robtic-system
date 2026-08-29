package org.robtic.dragonbattle.dragon.movement;

import org.bukkit.Location;
import org.bukkit.entity.EnderDragon;
import org.bukkit.util.Vector;

import java.util.Optional;

/**
 * Flies the dragon. The plugin's movement authority, replacing vanilla's entirely.
 *
 * <h2>Why vanilla movement had to go</h2>
 *
 * An ender dragon steers towards a ring of flight nodes the server generates for the End. They sit
 * at roughly y=80 — a height chosen for the End's island — and every vanilla movement phase
 * (circling, strafing, charging, approaching the portal) targets one of them. In the End that is
 * invisible. In a custom arena it means the dragon hangs near y=80 whatever the fight says, will not
 * descend to a low perch, and climbs back the moment anything puts it lower.
 *
 * Those nodes are not exposed by any API and cannot be moved. The only way to own the dragon's
 * altitude is to stop using vanilla's movement at all, which is what this does.
 *
 * <h2>How vanilla is taken out of the loop</h2>
 *
 * Three things, and they are deliberately belt and braces — the dragon is the one entity in the game
 * with bespoke movement code, and being wrong about any single mechanism would put the fight back
 * where it started:
 *
 * <ol>
 *   <li><b>{@code setAware(false)}.</b> The documented way to stop a mob running its AI. Whether it
 *       reaches an ender dragon's own {@code aiStep} is a server-internals question this plugin
 *       cannot answer from the API, so it is applied and then not relied upon.</li>
 *   <li><b>{@link EnderDragon.Phase#HOVER}.</b> The one vanilla flight phase whose destination is
 *       the dragon's own position rather than a node. Held here, there is no y≈80 attractor left in
 *       the system even if the AI is still running. The anchor is refreshed as the dragon travels —
 *       see {@link #reanchor} — because it is captured once when the phase begins.</li>
 *   <li><b>The position is asserted every tick.</b> Whatever vanilla did during its own tick, the
 *       next thing to touch the dragon is this, and it writes the position the path asked for.</li>
 * </ol>
 *
 * <h2>Smooth, not teleported</h2>
 *
 * The dragon is stepped towards its target by at most {@link FlightPath#speed()} blocks per tick.
 * A movement that small is sent to clients as a relative move, which they interpolate — the same
 * mechanism that makes every other entity on the server look like it is moving rather than
 * blinking. It is only a teleport in the sense that the server sets a position; nothing snaps.
 *
 * Turning is rate-limited separately, so the dragon banks into a change of direction instead of
 * pivoting on the spot.
 *
 * <h2>What is deliberately left alone</h2>
 *
 * The entity is a real ender dragon throughout. Its hitbox, its parts, its damage handling, its
 * death sequence, the boss bar and every animation are untouched — this class sets a position, a
 * rotation and a phase, and nothing else. Phases that do not move the dragon (the sitting and attack
 * poses) are still used for exactly what they are good at.
 */
public final class FlightController {

    private final EnderDragon dragon;

    /** How far the dragon may travel before the hover anchor is refreshed. See {@link #reanchor}. */
    private static final double ANCHOR_DRIFT = 8.0d;

    /** Degrees per tick the dragon may turn. Enough to corner, little enough to bank. */
    private static final float TURN_RATE = 12.0f;

    private FlightPath path;

    /** Where the hover anchor was last set, so drift can be measured without asking the server. */
    private Location anchor;

    public FlightController(EnderDragon dragon) {
        this.dragon = dragon;
    }

    /**
     * Takes movement authority.
     *
     * Called once, when the dragon is spawned. Everything it does is idempotent, so calling it again
     * — after a chunk reload, say — costs nothing and repairs a dragon something else has meddled
     * with.
     */
    public void assume() {
        dragon.setAware(false);

        // Gravity off as well. A dragon whose AI has been stopped is no longer flying itself, and a
        // falling boss is a spectacular way to discover that.
        dragon.setGravity(false);

        reanchor();
    }

    /** Hands movement back, for a dragon that is dying or being released. */
    public void release() {
        dragon.setAware(true);
        dragon.setGravity(true);
    }

    /**
     * Starts flying a path. Replaces whatever was being flown.
     *
     * @param replacement the new pattern, or null to hold position where the dragon is
     */
    public void fly(FlightPath replacement) {
        this.path = replacement;
    }

    public Optional<FlightPath> path() {
        return Optional.ofNullable(path);
    }

    /** The name of the pattern being flown, for debug output. */
    public String describe() {
        return path == null ? "idle" : path.name();
    }

    /**
     * One tick of flight.
     *
     * @return true when the current path has finished, which the caller reads as "choose another"
     */
    public boolean tick(long now) {
        if (!dragon.isValid()) {
            return true;
        }

        // Re-applied rather than assumed. Another plugin, a phase change of our own, or a reload can
        // all put the dragon back under its own control, and the symptom would be it drifting back
        // towards vanilla's flight height with nothing to explain it.
        if (dragon.isAware()) {
            dragon.setAware(false);
        }

        if (path == null) {
            hold();
            return false;
        }

        Optional<Location> target = path.target(dragon, now);

        if (target.isEmpty()) {
            hold();
            return path.finished(dragon, now);
        }

        // The destination is used exactly as the path gave it. Nothing here clamps it, rounds it, or
        // adjusts its Y — a path that says y=10 is flown to y=10, which is the entire point of this
        // class existing.
        steer(target.get(), path.speed());

        if (path.faceTravelDirection()) {
            face(target.get());
        } else {
            path.lookAt(dragon, now).ifPresent(this::face);
        }

        return path.finished(dragon, now);
    }

    /**
     * Moves one step towards a destination.
     *
     * The step is capped at the path's speed, so a distant target is approached at a constant rate
     * rather than reached in one frame. A target closer than one step is arrived at exactly, which is
     * what stops the dragon oscillating around a point it keeps overshooting.
     */
    private void steer(Location destination, double speed) {
        Location from = dragon.getLocation();

        if (from.getWorld() == null || destination.getWorld() == null
                || !from.getWorld().equals(destination.getWorld())) {
            return;
        }

        double dx = destination.getX() - from.getX();
        double dy = destination.getY() - from.getY();
        double dz = destination.getZ() - from.getZ();

        double distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < 1.0e-4d) {
            hold();
            return;
        }

        double step = Math.min(Math.max(0.05d, speed), distance);
        double scale = step / distance;

        Location next = from.clone().add(dx * scale, dy * scale, dz * scale);

        // Yaw and pitch are carried over and adjusted separately by face(), so a step never snaps the
        // dragon's head round to point at wherever it happens to be going next.
        next.setYaw(from.getYaw());
        next.setPitch(from.getPitch());

        move(next);
    }

    /** Holds position, still asserting it so nothing else can drift the dragon off its mark. */
    private void hold() {
        move(dragon.getLocation());
    }

    /**
     * Writes the dragon's position for this tick.
     *
     * The velocity is zeroed with it. Vanilla's movement reads the entity's own delta, so leaving a
     * value there would have it carried into the next tick and compound — the dragon would accelerate
     * away from a path that had asked for a steady speed.
     */
    private void move(Location to) {
        dragon.teleport(to);
        dragon.setVelocity(ZERO);

        if (anchor == null || anchor.getWorld() == null
                || !anchor.getWorld().equals(to.getWorld())
                || anchor.distanceSquared(to) > ANCHOR_DRIFT * ANCHOR_DRIFT) {
            reanchor();
        }
    }

    private static final Vector ZERO = new Vector(0, 0, 0);

    /**
     * Refreshes the hover anchor to wherever the dragon is now.
     *
     * {@link EnderDragon.Phase#HOVER} captures its destination once, when the phase begins, and
     * steers towards it forever after. Left alone while the dragon travels, that stale point becomes
     * a weak tether pulling it back to where it started hovering.
     *
     * Re-entering the phase is what re-captures it, and re-entering means passing through another
     * phase first — a phase manager ignores a request for the phase it is already in. The
     * intermediate is never ticked, so it never moves the dragon; the only cost is a data-watcher
     * update, which is why this happens on drift rather than every tick.
     */
    private void reanchor() {
        if (dragon.getPhase() == EnderDragon.Phase.HOVER) {
            dragon.setPhase(EnderDragon.Phase.CIRCLING);
        }

        dragon.setPhase(EnderDragon.Phase.HOVER);
        anchor = dragon.getLocation();
    }

    // ─── Facing ───────────────────────────────────────────────────────────────────────────────

    /**
     * Turns the dragon towards a point, a little at a time.
     *
     * Rate-limited so a change of target reads as a turn rather than a snap. The pitch follows the
     * climb or descent, which is what makes a dive look like a dive instead of a horizontal dragon
     * sliding downwards.
     */
    private void face(Location target) {
        Location from = dragon.getLocation();

        double dx = target.getX() - from.getX();
        double dy = target.getY() - from.getY();
        double dz = target.getZ() - from.getZ();

        double flat = Math.sqrt(dx * dx + dz * dz);

        if (flat < 1.0e-4d && Math.abs(dy) < 1.0e-4d) {
            return;
        }

        float desiredYaw = (float) Math.toDegrees(Math.atan2(-dx, dz));
        float desiredPitch = (float) Math.toDegrees(-Math.atan2(dy, flat));

        dragon.setRotation(
                approach(from.getYaw(), desiredYaw),
                approach(from.getPitch(), desiredPitch));
    }

    /**
     * Moves an angle towards another by at most {@link #TURN_RATE}, the short way round.
     *
     * The wrap matters: turning from 170° to -170° is twenty degrees, not three hundred and forty,
     * and getting it wrong makes the dragon spin the long way round every time it crosses south.
     */
    private static float approach(float current, float desired) {
        float delta = wrap(desired - current);

        if (Math.abs(delta) <= TURN_RATE) {
            return wrap(desired);
        }

        return wrap(current + Math.copySign(TURN_RATE, delta));
    }

    /** Normalises an angle to [-180, 180). */
    private static float wrap(float angle) {
        float wrapped = angle % 360.0f;

        if (wrapped >= 180.0f) {
            wrapped -= 360.0f;
        } else if (wrapped < -180.0f) {
            wrapped += 360.0f;
        }

        return wrapped;
    }
}
