package org.robtic.minecraft.structure.api;

import java.util.Locale;

/**
 * How many times one marker type may appear inside a single structure.
 *
 * <h2>Why this is data rather than code</h2>
 *
 * "Duplicate Origin" and "Duplicate NPC marker" are the same rule applied to two types. Expressing
 * the rule as a property of the type means {@link org.robtic.minecraft.structure.validate.MarkerValidator}
 * has one implementation of it, and a marker type invented next year gets the same checking without
 * anybody editing the validator.
 */
public enum MarkerCardinality {

    /** Must appear exactly once. Origin and End: a structure with two of either has no defined region. */
    EXACTLY_ONE,

    /** May appear once or not at all. Every NPC slot: absent means the slot is simply unused. */
    AT_MOST_ONE,

    /** May appear any number of times. Decoration, particles, sounds — anything positional. */
    ANY;

    /** Whether more than one occurrence is a problem. */
    public boolean singular() {
        return this != ANY;
    }

    /** Whether zero occurrences is a problem <em>for this cardinality</em>; see also {@link MarkerType#required()}. */
    public boolean mandatory() {
        return this == EXACTLY_ONE;
    }

    /** Falls back to {@link #ANY} rather than failing: a typo should not delete a marker type. */
    public static MarkerCardinality parse(String raw, String where, java.util.logging.Logger logger) {
        if (raw == null || raw.isBlank()) {
            return ANY;
        }

        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT).replace('-', '_'));
        } catch (IllegalArgumentException unknown) {
            logger.warning(where + ": unknown cardinality \"" + raw
                    + "\", using ANY. Valid values are exactly-one, at-most-one, any.");
            return ANY;
        }
    }
}
