package org.robtic.core.util;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Normalises and validates the identifiers every progression registry is keyed by.
 *
 * <h2>Why this is not just {@code toLowerCase}</h2>
 *
 * These ids end up in three places that each have their own opinion about what a string may
 * contain: YAML keys, permission nodes ({@code robtic.job.<id>}) and PlaceholderAPI arguments
 * ({@code %robtic_job_level_<id>%}). A space or a dot that YAML accepts happily would silently
 * produce an unmatchable permission node and a placeholder that parses as two arguments.
 *
 * So the character set is the intersection of what all three tolerate, checked once here, rather
 * than a bug discovered months later by an operator who named a job "Deep Miner".
 *
 * <h2>The hyphen is allowed, and excluding it was a bug</h2>
 *
 * It used to be rejected alongside {@code .} and space, which reads as caution and was not. A dot
 * genuinely breaks things — it is the separator in permission nodes and in attribute paths like
 * {@code job.miner.level}, so an id containing one splits into pieces. A space genuinely breaks
 * things. A hyphen breaks nothing: nothing in the codebase splits on it, Bukkit permissions accept
 * it, and PlaceholderAPI arguments accept it.
 *
 * What excluding it did break was Core's own configuration. The built-in unlock condition types are
 * named {@code attribute-at-least}, {@code attribute-equals}, {@code all-of} and {@code any-of};
 * every one was refused by the registry at startup, so every title gated on one — which is all of
 * the interesting ones — could never be unlocked, and the shipped {@code titles.yml} logged four
 * warnings about types it had itself just failed to register.
 */
public final class Ids {

    /**
     * Lowercase letters, digits, underscore and hyphen.
     *
     * Still excludes {@code .} and space, which are the two that actually break a permission node or
     * an attribute path. See the class note for why the hyphen is not among them.
     */
    private static final Pattern VALID = Pattern.compile("[a-z0-9_-]{1,48}");

    private Ids() {
    }

    /**
     * Lowercases and trims, so casing in a config file is never load-bearing.
     *
     * Does not repair an invalid id — that is {@link #valid}'s job, and quietly rewriting
     * {@code "Deep Miner"} into {@code "deep_miner"} would mean the config and the running server
     * disagreed about what the job is called.
     */
    public static String normalise(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    /** Whether this id is usable as a registry key, permission fragment and placeholder argument. */
    public static boolean valid(String id) {
        return id != null && VALID.matcher(id).matches();
    }

    /**
     * A human-readable explanation of why an id was rejected, for the operator-facing warning.
     *
     * Returned rather than logged here so the caller can name the file and the section the bad id
     * came from — "invalid id" on its own is not something anybody can act on.
     */
    public static String describeProblem(String id) {
        if (id == null || id.isBlank()) {
            return "it is empty";
        }
        if (id.length() > 48) {
            return "it is longer than 48 characters";
        }
        return "it may only contain lowercase letters, digits, underscores and hyphens";
    }
}
