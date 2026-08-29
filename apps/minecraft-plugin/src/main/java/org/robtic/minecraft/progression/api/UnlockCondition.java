package org.robtic.minecraft.progression.api;

/**
 * One requirement that must hold before something is unlocked.
 *
 * Conditions are combined rather than extended: a title needing "Miner level 10 and a permission"
 * carries two of these, not a bespoke type. {@code all-of}, {@code any-of} and {@code not} are
 * themselves conditions, so arbitrary logic is expressible in YAML without any of it being code.
 *
 * <h2>Must be cheap and side-effect free</h2>
 *
 * These are evaluated on the tick, once per locked title, every time a GUI page is drawn — and again
 * on every XP gain for the automatic-unlock check. An implementation that queries a database or
 * mutates anything will be found by players as lag, and by the next reader as a surprise.
 */
@FunctionalInterface
public interface UnlockCondition {

    /** A condition that is always met, used where a config omits requirements entirely. */
    UnlockCondition ALWAYS = context -> true;

    /** Whether this requirement currently holds for the player in the context. */
    boolean satisfied(UnlockContext context);

    /**
     * One short line telling a player what they still have to do, shown on locked GUI entries.
     *
     * Default is deliberately vague: a condition that does not describe itself is better rendered as
     * "Requirements not met" than as a class name. Every built-in type overrides it, and any custom
     * one that reaches players should too.
     */
    default String describe() {
        return "Requirements not met";
    }

    /** Builds a condition with a description, so implementations stay one expression. */
    static UnlockCondition of(String description, UnlockCondition delegate) {
        return new UnlockCondition() {
            @Override
            public boolean satisfied(UnlockContext context) {
                return delegate.satisfied(context);
            }

            @Override
            public String describe() {
                return description;
            }
        };
    }
}
