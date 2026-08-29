package org.robtic.minecraft.util;

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
 */
public final class Ids {

    /** Lowercase letters, digits and underscore. Deliberately excludes {@code .}, {@code -} and space. */
    private static final Pattern VALID = Pattern.compile("[a-z0-9_]{1,48}");

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
        return "it may only contain lowercase letters, digits and underscores";
    }
}
