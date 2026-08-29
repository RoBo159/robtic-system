package org.robtic.minecraft.progression.api;

import org.bukkit.configuration.ConfigurationSection;

import java.util.Optional;

/**
 * Turns one YAML block into an {@link UnlockCondition}.
 *
 * <h2>Open for extension without editing this package</h2>
 *
 * A future Dungeons system that wants {@code type: dungeon-cleared} registers one of these at boot
 * and the title config accepts it immediately. Nothing in the title system learns that dungeons
 * exist — the same arrangement {@link AttributeProvider} makes for values, made here for logic.
 *
 * Most systems will not need one. {@code attribute-at-least} already covers "level ≥ N" for anything
 * that publishes an attribute, which is the overwhelming majority of real requirements; a custom
 * type is for logic that genuinely cannot be phrased as a number comparison.
 */
public interface UnlockConditionType extends Identified {

    /**
     * Parses a condition, or reports why it could not be parsed.
     *
     * @param section the block below {@code type}, never null
     * @return the condition, or empty when the section is invalid. Returning empty rather than
     *         throwing keeps one broken condition from aborting the load of an entire titles file —
     *         the caller warns, skips the condition and carries on
     */
    Optional<UnlockCondition> create(ConfigurationSection section, ConditionProblems problems);

    /**
     * Somewhere for a type to explain what was wrong, so the message names the file and key.
     *
     * A callback rather than a return value or an exception because one section can have several
     * problems, and an operator fixing a config wants all of them at once rather than one per
     * restart.
     */
    @FunctionalInterface
    interface ConditionProblems {
        void report(String problem);
    }
}
