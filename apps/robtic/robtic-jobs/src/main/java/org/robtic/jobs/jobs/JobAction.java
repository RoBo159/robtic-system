package org.robtic.jobs.jobs;

import java.util.Locale;

/**
 * Something a player did, described generically enough that no job is named in code.
 *
 * <h2>The seam between listeners and jobs</h2>
 *
 * A block-break listener knows a player broke {@code DIAMOND_ORE}. It does not know that Miner
 * exists, that Miner rewards ore, or that a server might add a Prospector job tomorrow that rewards
 * the same block differently. It emits {@code break:DIAMOND_ORE} and stops thinking.
 *
 * Every active job then looks that key up in its own configured reward table. Adding a job is YAML;
 * adding a *kind* of action — say brewing — is one listener that emits {@code brew:<potion>}, with
 * no edit to the job system at all. This is what "no hardcoded profession logic" has to mean in
 * practice: the code knows verbs, the config knows professions.
 *
 * <h2>Wildcards</h2>
 *
 * A reward table may key on {@code break:STONE} for a specific block or {@code break:*} for every
 * block. Both are looked up, specific first, so a job can set a broad default and then override it —
 * which is how "all logs give 3 XP except ancient debris" is expressed without listing every wood.
 *
 * @param verb   what happened, lowercase: {@code break}, {@code place}, {@code harvest},
 *               {@code fish}, {@code kill}, {@code breed}, {@code smelt}, {@code sell}
 * @param target what it happened to, uppercase: a material, an entity type, an item id
 */
public record JobAction(String verb, String target) {

    public JobAction {
        verb = verb == null ? "" : verb.trim().toLowerCase(Locale.ROOT);
        target = target == null ? "" : target.trim().toUpperCase(Locale.ROOT);
    }

    public static JobAction of(String verb, String target) {
        return new JobAction(verb, target);
    }

    public static JobAction of(String verb, Enum<?> target) {
        return new JobAction(verb, target.name());
    }

    /** The exact key, e.g. {@code break:DIAMOND_ORE}. */
    public String key() {
        return verb + ":" + target;
    }

    /** The catch-all key for this verb, e.g. {@code break:*}. Checked when the exact key misses. */
    public String wildcardKey() {
        return verb + ":*";
    }

    /**
     * Normalises a key written in config, so {@code Break: Stone} and {@code break:STONE} match.
     *
     * Operators write these by hand in {@code jobs.yml}, and a reward that silently never fires
     * because of a capital letter is close to impossible to debug from in-game symptoms.
     */
    public static String normaliseKey(String raw) {
        if (raw == null) {
            return "";
        }

        int split = raw.indexOf(':');

        if (split < 0) {
            // No verb given. Treated as a break, which is by far the commonest and keeps the short
            // form "STONE: 2" working for the simple case.
            return "break:" + raw.trim().toUpperCase(Locale.ROOT);
        }

        return raw.substring(0, split).trim().toLowerCase(Locale.ROOT)
                + ":" + raw.substring(split + 1).trim().toUpperCase(Locale.ROOT);
    }
}
