package org.robtic.dragonbattle.dragon;

import org.bukkit.Location;
import org.bukkit.entity.EnderDragon;
import org.bukkit.entity.Player;
import org.robtic.dragonbattle.dragon.movement.FlightController;
import org.robtic.dragonbattle.dragon.movement.FlightPath;
import org.robtic.dragonbattle.dragon.movement.FlightPaths;
import org.robtic.dragonbattle.model.Perch;
import org.robtic.dragonbattle.model.StoredLocation;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Drives one dragon: where it flies, where it lands, and what it does while sitting.
 *
 * <h2>The entity is vanilla; the movement is not</h2>
 *
 * This plugin does not replace Minecraft's dragon or touch its {@code DragonBattle} object. It is a
 * real ender dragon with a real hitbox, real parts, real damage handling, a real death sequence and
 * every one of its animations.
 *
 * What it no longer does is move itself. Vanilla flight steers towards a ring of nodes generated for
 * the End at roughly y=80, which no phase will leave — so a dragon in a custom arena hung at that
 * height, refused to descend to a low perch, and climbed back whenever anything put it lower. Those
 * nodes are not exposed by any API, so the only way to own the dragon's altitude is to own its
 * movement. See {@link FlightController}.
 *
 * <h2>Phases are used for what they are good at</h2>
 *
 * The vanilla phase system is still here, because it drives animation and pose and does that well.
 * What it is no longer allowed to do is decide where the dragon is: the flying phases (circling,
 * strafing, charging, flying to the portal) are never set, and the sitting ones — which do not move
 * the dragon at all — are used exactly as before.
 *
 * <h2>Every destination comes from the fight</h2>
 *
 * A perch at y=20 is flown to at y=20. Nothing here clamps a destination, adjusts its height, or has
 * an opinion about how low is too low.
 */
public final class DragonController {

    private final EnderDragon dragon;
    private final FlightController flight;
    private final DragonFlightSettings settings;

    public DragonController(EnderDragon dragon, DragonFlightSettings settings) {
        this.dragon = dragon;
        this.settings = settings;
        this.flight = new FlightController(dragon);
    }

    public EnderDragon entity() {
        return dragon;
    }

    public FlightController flight() {
        return flight;
    }

    /** Takes movement authority. Called once when the dragon is spawned, and safe to repeat. */
    public void assumeControl() {
        flight.assume();
    }

    /** Hands movement back to the server, for a dragon that is about to die or be removed. */
    public void releaseControl() {
        flight.release();
    }

    /**
     * One tick of flight.
     *
     * @return true when the current pattern has run its course and the caller should choose another
     */
    public boolean tickFlight(long now) {
        return flight.tick(now);
    }

    // ─── Flight ───────────────────────────────────────────────────────────────────────────────

    /**
     * Circles a point.
     *
     * The state a flying dragon returns to between attacks. The centre is whatever the fight
     * supplies — the middle of the arena's own volume — so the orbit sits wherever the arena is,
     * however far underground that happens to be.
     */
    public void circle(Location centre) {
        flight.fly(FlightPaths.circle(
                centre,
                settings.circleRadius(),
                settings.circlePeriodTicks(),
                settings.cruiseSpeed(),
                java.util.concurrent.ThreadLocalRandom.current().nextBoolean()));
    }

    /**
     * Attacks a player from the air.
     *
     * Chooses between a dive and a strafing run rather than always doing one: a dragon that only
     * dived would be trivially dodgeable, and one that only strafed would never threaten anybody who
     * kept moving.
     *
     * Both are this plugin's own patterns now. The vanilla equivalents were movement phases, which
     * means they were also the phases that dragged the dragon back to y≈80 mid-attack.
     */
    public void attackFromAir(Player target) {
        if (target == null || !target.isOnline()) {
            return;
        }

        if (java.util.concurrent.ThreadLocalRandom.current().nextBoolean()) {
            // Aimed a little above the player: the pass is the attack, and a dive that stopped on
            // top of somebody would read as the dragon crashing.
            flight.fly(FlightPaths.dive(
                    target.getLocation().clone().add(0.0d, settings.diveHeight(), 0.0d),
                    settings.diveSpeed(),
                    settings.diveOvershoot()));

            setPhase(EnderDragon.Phase.CHARGE_PLAYER);
            return;
        }

        flight.fly(FlightPaths.strafe(
                target,
                settings.strafeRadius(),
                settings.strafeHeight(),
                settings.strafePeriodTicks(),
                settings.cruiseSpeed()));

        setPhase(EnderDragon.Phase.STRAFING);
    }

    /**
     * Flies a fixed list of waypoints, for a cinematic.
     *
     * The seam a scripted sequence uses. The dragon flies exactly the points it is given, at exactly
     * the heights they specify — a cutscene that wants it to sweep along a cavern floor gets that.
     */
    public void followScript(List<Location> waypoints) {
        if (waypoints.isEmpty()) {
            return;
        }

        flight.fly(FlightPaths.scripted(waypoints, settings.cruiseSpeed(), settings.arrivalDistance()));
    }

    /** Holds position. */
    public void hover() {
        flight.fly(FlightPaths.hover(dragon.getLocation(), settings.cruiseSpeed()));
    }

    // ─── Landing ──────────────────────────────────────────────────────────────────────────────

    /**
     * Sends the dragon to a perch.
     *
     * <h2>Why this is no longer a vanilla approach</h2>
     *
     * It used to move the dragon's podium to the perch and ask for {@code FLY_TO_PORTAL}, on the
     * reasoning that vanilla's own approach would then do the flying. It will not: that phase
     * navigates by the same node ring as everything else, so a perch below it was circled over and
     * never reached. A perch at y=20 was simply unusable.
     *
     * The approach is a {@link FlightPaths#travel} now, and the perch's Y is used exactly as
     * configured.
     *
     * @return false when the perch's world is not loaded, in which case nothing was changed
     */
    public boolean flyTo(Perch perch) {
        Optional<Location> destination = perch.location().toBlockCentre();

        if (destination.isEmpty()) {
            return false;
        }

        flight.fly(FlightPaths.travel(
                destination.get(), settings.approachSpeed(), settings.arrivalDistance()));

        return true;
    }

    /**
     * Puts the dragon into its landed pose at a perch.
     *
     * Called once the approach has arrived. The podium is set to the perch and the phase to
     * {@code LAND_ON_PORTAL}, which is the animation vanilla plays when the dragon settles — so the
     * pose and the hitbox are the real ones.
     *
     * That phase does move the dragon, towards its podium. Here the podium *is* the perch and the
     * dragon is already standing on it, so there is nowhere for it to be moved to — and the flight
     * controller holds the position underneath it regardless.
     */
    public void perch(Location at) {
        dragon.setPodium(at);
        flight.fly(FlightPaths.hover(at, settings.approachSpeed()));

        setPhase(EnderDragon.Phase.LAND_ON_PORTAL);
    }

    /** Whether the dragon has arrived and is sitting. */
    public boolean isPerched() {
        EnderDragon.Phase phase = dragon.getPhase();

        return phase == EnderDragon.Phase.LAND_ON_PORTAL
                || phase == EnderDragon.Phase.SEARCH_FOR_BREATH_ATTACK_TARGET
                || phase == EnderDragon.Phase.ROAR_BEFORE_ATTACK
                || phase == EnderDragon.Phase.BREATH_ATTACK;
    }

    /**
     * Whether the dragon is still travelling to a perch.
     *
     * Asked of the flight controller rather than of the dragon's phase. The phase no longer says
     * anything about where the dragon is going — that is the point of the refactor — so reading it
     * here would have been asking the wrong object.
     */
    public boolean isApproaching() {
        return flight.path().map(FlightPath::name).filter("travel"::equals).isPresent();
    }

    /** Leaves the perch and returns to flight. */
    public void takeOff(Location circleCentre) {
        setPhase(EnderDragon.Phase.LEAVE_PORTAL);
        circle(circleCentre);
    }

    // ─── Ground combat ────────────────────────────────────────────────────────────────────────

    /**
     * One tick of ground behaviour: face the nearest player, and occasionally attack.
     *
     * Facing is done by hand because a perched dragon does not turn towards anybody on its own — it
     * faces whatever direction it landed in, which reads as the fight having stopped.
     */
    public void groundTick(List<Player> nearby, double attackChance, GroundCombat combat) {
        Optional<Player> nearest = nearest(nearby);

        if (nearest.isEmpty()) {
            return;
        }

        faceTowards(nearest.get().getLocation());

        if (java.util.concurrent.ThreadLocalRandom.current().nextDouble() >= attackChance) {
            return;
        }

        // The attack is chosen and carried out by GroundCombat; the phase set here is only what the
        // client should be shown doing. Bite and tail have no phase of their own, so the dragon is
        // put into its roar animation for those — it is the only one that reads as a melee lunge.
        //
        // Every phase below is a sitting one, which does not move the dragon.
        GroundCombat.Attack attack = combat.perform(dragon, nearby);

        setPhase(switch (attack) {
            case BREATH -> EnderDragon.Phase.BREATH_ATTACK;
            case ROAR, BITE, TAIL -> EnderDragon.Phase.ROAR_BEFORE_ATTACK;
        });
    }

    /**
     * Turns the dragon's body towards a point without moving it.
     *
     * {@code setRotation} rather than a teleport to the same place with a new yaw, which is what this
     * used to do. The API for turning an entity exists; going through a teleport to reach it also
     * went through the whole position path, on every tick of every perched dragon.
     */
    public void faceTowards(Location target) {
        Location from = dragon.getLocation();

        double dx = target.getX() - from.getX();
        double dz = target.getZ() - from.getZ();

        dragon.setRotation((float) Math.toDegrees(Math.atan2(-dx, dz)), from.getPitch());
    }

    private Optional<Player> nearest(List<Player> players) {
        Location where = dragon.getLocation();

        return players.stream()
                .filter(player -> player.getWorld().equals(where.getWorld()))
                .min(Comparator.comparingDouble(player -> player.getLocation().distanceSquared(where)));
    }

    /**
     * Sets a phase, ignoring a request for the one already active.
     *
     * Only ever called with a phase that does not move the dragon, or with one whose destination is
     * somewhere this plugin has already put it. The flight controller owns position regardless, but
     * setting a flying phase would still have vanilla fighting it for the yaw.
     */
    private void setPhase(EnderDragon.Phase phase) {
        if (dragon.getPhase() != phase) {
            dragon.setPhase(phase);
        }
    }

    /** Points the dragon's podium at a fixed position, for the portal it returns to on death. */
    public void podium(StoredLocation location) {
        location.toBlockCentre().ifPresent(dragon::setPodium);
    }

    /** Points the dragon's podium at a position that is already resolved. */
    public void podium(Location location) {
        dragon.setPodium(location);
    }
}
