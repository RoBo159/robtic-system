package org.robtic.minecraft.structure.api;

import org.robtic.minecraft.progression.api.WorldPoint;

import java.util.Optional;

/**
 * Something wrong with a structure's markers, phrased so a builder can act on it.
 *
 * <h2>Severity decides what happens, not how loud the message is</h2>
 *
 * A {@link Severity#FATAL} problem means the structure cannot be used at all — there is no region,
 * or no recruiter, so registering it would produce a building nobody can ever claim. A
 * {@link Severity#WARNING} means it will work but something is probably not what the builder
 * intended. The scanner refuses fatal structures and accepts warned ones, which is the difference
 * between "this is broken" and "check this".
 *
 * <h2>Why every problem carries a position</h2>
 *
 * "Duplicate NPC slot 3" sends a builder hunting through a building. "Duplicate NPC slot 3 at
 * 104, 71, -238" sends them to the block. The position is optional only for problems that are about
 * an absence, where there is by definition nowhere to point.
 *
 * @param severity whether this stops the structure working
 * @param code     stable, lowercase, machine-readable; for tests and for a future admin GUI that
 *                 wants to group problems without matching on English
 * @param message  the human sentence, already complete — callers prefix but never rewrite it
 * @param where    the block involved, when there is one
 */
public record MarkerProblem(Severity severity, String code, String message, Optional<WorldPoint> where) {

    public enum Severity {

        /** The structure cannot be registered. */
        FATAL,

        /** The structure works, but something looks wrong. */
        WARNING
    }

    public static MarkerProblem fatal(String code, String message) {
        return new MarkerProblem(Severity.FATAL, code, message, Optional.empty());
    }

    public static MarkerProblem fatal(String code, String message, WorldPoint where) {
        return new MarkerProblem(Severity.FATAL, code, message, Optional.ofNullable(where));
    }

    public static MarkerProblem warning(String code, String message) {
        return new MarkerProblem(Severity.WARNING, code, message, Optional.empty());
    }

    public static MarkerProblem warning(String code, String message, WorldPoint where) {
        return new MarkerProblem(Severity.WARNING, code, message, Optional.ofNullable(where));
    }

    public boolean isFatal() {
        return severity == Severity.FATAL;
    }

    /** The message with its position appended, for a console line or a chat message. */
    public String describe() {
        return where.map(point -> message + " (" + point.describe() + ")").orElse(message);
    }
}
