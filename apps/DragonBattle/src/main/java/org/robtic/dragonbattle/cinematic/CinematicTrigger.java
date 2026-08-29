package org.robtic.dragonbattle.cinematic;

import org.robtic.dragonbattle.battle.BattleState;

import java.util.Locale;
import java.util.Optional;

/**
 * The named moments a cinematic can be attached to.
 *
 * <h2>Names, not battle states</h2>
 *
 * The config used to be keyed by {@link BattleState}, which meant an operator had to know the
 * plugin's internal state machine to attach a cutscene — and that {@code fight_start} and
 * {@code fight_finish}, the two moments anybody actually asks for, had no name at all. They map onto
 * {@code DRAGON_SPAWN} and {@code COMPLETED}, which is not something a config file should require you
 * to work out.
 *
 * So triggers are their own vocabulary. Each names a moment in the fight; where that moment sits in
 * the state machine is this class's business rather than the operator's.
 *
 * <h2>Adding one without changing this file</h2>
 *
 * A trigger is looked up by string. Anything in {@code cinematics.yml} that is not one of the names
 * below is matched against {@link BattleState}, so every state the machine has is addressable by its
 * own name too — {@code LANDING}, {@code TAKEOFF}, {@code PORTAL_OPENING} and the rest. A future
 * state therefore becomes configurable the moment it is added to the enum, with nothing here to
 * update.
 *
 * @param id    the key as written in the config, lowercase
 * @param state the battle state that fires it
 */
public record CinematicTrigger(String id, BattleState state) {

    /** The crystals are complete and the ritual begins. */
    public static final String RITUAL_START = "ritual_start";

    /** The dragon entity appears. */
    public static final String DRAGON_SPAWN = "dragon_spawn";

    /** The fight proper begins — the dragon is flying and players can hit it. */
    public static final String FIGHT_START = "fight_start";

    /** The dragon is dying. */
    public static final String DRAGON_DEATH = "dragon_death";

    /** Everything is over: portal built, beacon lit, gateways open. */
    public static final String FIGHT_FINISH = "fight_finish";

    /**
     * Resolves a config key.
     *
     * The four named triggers first, then any battle state by name. Empty when it is neither, which
     * the caller reports — a misspelled key would otherwise be a cinematic that silently never plays,
     * and an operator has no way to tell that apart from a fault in their cinematics plugin.
     */
    public static Optional<CinematicTrigger> parse(String key) {
        if (key == null || key.isBlank()) {
            return Optional.empty();
        }

        String id = key.trim().toLowerCase(Locale.ROOT);

        BattleState named = switch (id) {
            case RITUAL_START -> BattleState.RESPAWN_ANIMATION;
            case DRAGON_SPAWN -> BattleState.DRAGON_SPAWN;
            case FIGHT_START -> BattleState.ACTIVE_FIGHT;
            case DRAGON_DEATH -> BattleState.DRAGON_DEATH;
            case FIGHT_FINISH -> BattleState.COMPLETED;
            default -> null;
        };

        if (named != null) {
            return Optional.of(new CinematicTrigger(id, named));
        }

        // Any battle state, by its own name. This is what keeps the system extensible: a state added
        // to the machine is configurable immediately, without a case here.
        try {
            return Optional.of(new CinematicTrigger(id, BattleState.valueOf(id.toUpperCase(Locale.ROOT))));
        } catch (IllegalArgumentException notAState) {
            return Optional.empty();
        }
    }

    /** Every key an operator may write, for the warning shown when one does not match. */
    public static String describeValidKeys() {
        StringBuilder builder = new StringBuilder();

        builder.append(RITUAL_START).append(", ")
                .append(DRAGON_SPAWN).append(", ")
                .append(FIGHT_START).append(", ")
                .append(DRAGON_DEATH).append(", ")
                .append(FIGHT_FINISH);

        for (BattleState state : BattleState.values()) {
            builder.append(", ").append(state.name().toLowerCase(Locale.ROOT));
        }

        return builder.toString();
    }
}
