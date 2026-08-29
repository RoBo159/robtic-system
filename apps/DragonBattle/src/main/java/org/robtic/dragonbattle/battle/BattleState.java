package org.robtic.dragonbattle.battle;

/**
 * The stages a battle moves through, in order.
 *
 * <h2>Why the vanilla loop is modelled as explicit states</h2>
 *
 * Minecraft's own dragon fight keeps this progression inside the server, where it cannot be
 * inspected, paused, reordered or configured. Naming each stage is what lets an operator disable the
 * cinematic without touching the respawn, or reset a battle that got stuck, and what lets a future
 * boss phase be inserted without rewriting the ones around it.
 *
 * <h2>Movement is forward-only, with one exception</h2>
 *
 * A battle advances through these in sequence; it never steps backwards. {@link #COMPLETED} returns
 * to {@link #WAITING} when the arena is reset, which is a new battle rather than a rewind of the old
 * one. {@link #isTerminal()} marks the states from which nothing advances on its own.
 */
public enum BattleState {

    /** Nothing is happening. Crystals may be placed. */
    WAITING,

    /** Every configured crystal position is filled; the ritual is about to begin. */
    CRYSTALS_PLACED,

    /** Beams, particles and sound. Purely presentational, and skippable. */
    RESPAWN_ANIMATION,

    /** The dragon entity is created at the configured spawn. */
    DRAGON_SPAWN,

    /** The dragon is flying and fighting. The state a battle spends almost all its time in. */
    ACTIVE_FIGHT,

    /** The dragon is flying to a chosen perch and sitting on it. */
    LANDING,

    /** The dragon is leaving a perch and returning to flight. */
    TAKEOFF,

    /** The dragon is playing its death animation. */
    DRAGON_DEATH,

    /** The exit portal is being generated. */
    PORTAL_OPENING,

    /** The beacon is placed and its effects played. */
    BEACON_SPAWN,

    /** End gateways are created according to the arena's gateway mode. */
    GATEWAY_OPENING,

    /** The battle is over. The arena waits to be reset. */
    COMPLETED;

    /**
     * Whether the battle advances out of this state on its own.
     *
     * The two that do not are the ones a human drives: {@link #WAITING} advances when players finish
     * placing crystals, and {@link #COMPLETED} advances when an operator resets the arena. Everything
     * between them is driven by the ticker.
     */
    public boolean isTerminal() {
        return this == WAITING || this == COMPLETED;
    }

    /** Whether the dragon should exist while the battle is in this state. */
    public boolean hasDragon() {
        return switch (this) {
            case DRAGON_SPAWN, ACTIVE_FIGHT, LANDING, TAKEOFF, DRAGON_DEATH -> true;
            default -> false;
        };
    }

    /** The state that follows this one when nothing interrupts. Null for the terminal states. */
    public BattleState next() {
        return switch (this) {
            case WAITING -> CRYSTALS_PLACED;
            case CRYSTALS_PLACED -> RESPAWN_ANIMATION;
            case RESPAWN_ANIMATION -> DRAGON_SPAWN;
            case DRAGON_SPAWN -> ACTIVE_FIGHT;
            // ACTIVE_FIGHT does not fall through: it ends by landing or by the dragon dying, and
            // which of those happens is the fight's business rather than the sequence's.
            case ACTIVE_FIGHT -> null;
            case LANDING -> TAKEOFF;
            case TAKEOFF -> ACTIVE_FIGHT;
            case DRAGON_DEATH -> PORTAL_OPENING;
            case PORTAL_OPENING -> BEACON_SPAWN;
            case BEACON_SPAWN -> GATEWAY_OPENING;
            case GATEWAY_OPENING -> COMPLETED;
            case COMPLETED -> null;
        };
    }
}
