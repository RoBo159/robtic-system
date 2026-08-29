package org.robtic.dragonbattle.battle;

import org.bukkit.entity.EnderDragon;
import org.robtic.dragonbattle.dragon.DragonController;
import org.robtic.dragonbattle.dragon.DragonFlightSettings;
import org.robtic.dragonbattle.dragon.PerchSelector;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.Perch;

import java.util.Optional;
import java.util.UUID;

/**
 * One running battle: the arena it belongs to, where it has got to, and what it is doing now.
 *
 * <h2>Held in memory only</h2>
 *
 * A battle is a property of a running server, not of a configuration. Persisting one would mean a
 * restart could resume a fight whose dragon no longer exists and whose players have gone — so a
 * restart ends the battle, which is also what an operator expects.
 *
 * <h2>The dragon is held by id, not by reference</h2>
 *
 * An {@link EnderDragon} reference outlives the entity it points at: after the dragon dies or its
 * chunk unloads the object is still there, still answers calls, and quietly does nothing. A UUID
 * forces every use through a lookup that can fail, which is the honest shape.
 */
public final class BattleContext {

    private final Arena arena;
    private final PerchSelector perchSelector = new PerchSelector();

    /**
     * The bar shown for this battle.
     *
     * Per battle rather than per plugin: two arenas fighting at once must show two different bars,
     * and a shared one would flicker between their health values.
     */
    private final DragonBossBar bossBar;

    private BattleState state = BattleState.WAITING;

    /** Server tick at which the current state began, for the timers each state runs on. */
    private long stateEnteredAt;

    private UUID dragonId;
    private Perch currentPerch;

    /** Tick at which the dragon should next consider landing. */
    private long nextLandingCheck;

    /** How many gateways this arena has opened, which drives SEQUENTIAL mode. */
    private int gatewaysOpened;

    public BattleContext(Arena arena, long now, DragonBossBar bossBar) {
        this.arena = arena;
        this.bossBar = bossBar;
        this.stateEnteredAt = now;
        this.nextLandingCheck = now + arena.settings().landingIntervalTicks();
    }

    public DragonBossBar bossBar() {
        return bossBar;
    }

    public Arena arena() {
        return arena;
    }

    public BattleState state() {
        return state;
    }

    public PerchSelector perchSelector() {
        return perchSelector;
    }

    /**
     * Moves to a new state and restarts its clock.
     *
     * The clock reset is the point: every state's timer is measured from when it began, so a state
     * that forgot to reset would inherit the previous one's elapsed time and expire immediately.
     */
    public void transition(BattleState next, long now) {
        this.state = next;
        this.stateEnteredAt = now;
    }

    /** How long the battle has been in its current state, in ticks. */
    public long ticksInState(long now) {
        return Math.max(0L, now - stateEnteredAt);
    }

    // ─── The dragon ───────────────────────────────────────────────────────────────────────────

    public void dragon(EnderDragon dragon) {
        this.dragonId = dragon == null ? null : dragon.getUniqueId();
        this.controller = null;
    }

    /**
     * The movement controller for this battle's dragon.
     *
     * <h2>Why it is held rather than rebuilt</h2>
     *
     * It used to be constructed fresh on every tick that needed it, which was free when it was a
     * thin wrapper that only set a vanilla phase. It is not free now: the controller holds the flight
     * pattern currently being flown and where the dragon's hover anchor was last set, and rebuilding
     * it each tick would restart the pattern every tick — a dive that never got past its first step,
     * a circle permanently at its start angle.
     *
     * Built on first use and dropped with the dragon, so a battle whose dragon has gone does not keep
     * a controller pointing at a dead entity.
     */
    public Optional<DragonController> controller(DragonFlightSettings settings) {
        if (controller != null) {
            return Optional.of(controller);
        }

        return dragon().map(live -> {
            controller = new DragonController(live, settings);
            return controller;
        });
    }

    private DragonController controller;

    public Optional<UUID> dragonId() {
        return Optional.ofNullable(dragonId);
    }

    /**
     * The live dragon, or empty when it has died, despawned, or its chunk has unloaded.
     *
     * Resolved through Bukkit on every call rather than cached, so a caller cannot act on an entity
     * that stopped existing between one tick and the next.
     */
    public Optional<EnderDragon> dragon() {
        if (dragonId == null) {
            return Optional.empty();
        }

        return Optional.ofNullable(org.bukkit.Bukkit.getEntity(dragonId))
                .filter(entity -> entity instanceof EnderDragon)
                .filter(entity -> entity.isValid())
                .map(EnderDragon.class::cast);
    }

    // ─── Landing ──────────────────────────────────────────────────────────────────────────────

    public Optional<Perch> currentPerch() {
        return Optional.ofNullable(currentPerch);
    }

    /**
     * Whether the dragon has finished its approach and is sitting on the current perch.
     *
     * Tracked here rather than read back from the dragon's phase, because the approach is driven by
     * this plugin rather than by vanilla pathing — the phase says what the client should be shown,
     * not where the dragon has got to.
     */
    public boolean arrivedAtPerch() {
        return arrivedAtPerch;
    }

    public void arrivedAtPerch(boolean arrived) {
        this.arrivedAtPerch = arrived;
    }

    /**
     * Restarts the state's clock without changing state.
     *
     * Used when the dragon reaches a perch: the stay timer should count from arrival, and the state
     * was entered when it set off.
     */
    public void resetStateClock(long now) {
        this.stateEnteredAt = now;
    }

    private boolean arrivedAtPerch;

    public void currentPerch(Perch perch) {
        this.currentPerch = perch;

        // Cleared with the perch, so a new landing always begins in the approaching state.
        this.arrivedAtPerch = false;
    }

    public boolean shouldConsiderLanding(long now) {
        return now >= nextLandingCheck;
    }

    /** Schedules the next landing consideration, whether or not this one produced a landing. */
    public void scheduleNextLandingCheck(long now) {
        this.nextLandingCheck = now + arena.settings().landingIntervalTicks();
    }

    /**
     * Whether the dragon should pick a new air attack.
     *
     * <h2>Why this is throttled at all</h2>
     *
     * Air attacks used to be chosen on every tick, which meant the phase flipped between charging
     * and strafing several times a second. Neither ever ran to completion: the dragon jittered in
     * place at altitude instead of diving at anybody, because each attack was cancelled by the next
     * one before it had moved.
     *
     * An attack now holds for a few seconds, which is roughly how long vanilla lets one run.
     */
    public boolean shouldPickAirAttack(long now) {
        return now >= nextAirAttack;
    }

    public void scheduleNextAirAttack(long now) {
        this.nextAirAttack = now + AIR_ATTACK_INTERVAL_TICKS;
    }

    /** Long enough for a charge to actually reach its target and for a strafe to be readable. */
    private static final long AIR_ATTACK_INTERVAL_TICKS = 80L;

    private long nextAirAttack;

    // ─── Gateways ─────────────────────────────────────────────────────────────────────────────

    public int gatewaysOpened() {
        return gatewaysOpened;
    }

    public void gatewayOpened() {
        gatewaysOpened++;
    }

    /** Clears everything a finished battle should not carry into the next one. */
    public void reset(long now) {
        // Removed here rather than at each of the places a battle can end. Death, reset, despawn and
        // shutdown all arrive at this method, and a bar left attached would sit on players' screens
        // with a health value that stopped updating.
        bossBar.hide();

        state = BattleState.WAITING;
        stateEnteredAt = now;
        dragonId = null;
        currentPerch = null;
        nextLandingCheck = now + arena.settings().landingIntervalTicks();
        perchSelector.reset();
    }
}
