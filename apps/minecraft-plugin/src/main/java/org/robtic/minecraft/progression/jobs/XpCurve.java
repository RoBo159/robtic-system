package org.robtic.minecraft.progression.jobs;

import org.bukkit.configuration.ConfigurationSection;

import java.util.List;
import java.util.Locale;
import java.util.logging.Logger;

/**
 * Converts between a job's accumulated XP and its level.
 *
 * <h2>One number is stored, the other is derived</h2>
 *
 * {@link JobProgress} holds total XP and nothing else. The level is computed from it on demand,
 * every time, by this class. The obvious alternative — storing both and incrementing the level when
 * XP crosses a threshold — has a failure mode that is very hard to notice and impossible to repair:
 * an operator edits the curve, and every existing player's stored level now disagrees with their
 * stored XP. Which one is right? There is no answer. Deriving means editing the curve simply
 * re-levels everyone consistently, which is what an operator editing a curve expects.
 *
 * <h2>Thresholds are precomputed</h2>
 *
 * The cumulative XP for every level is built once at load into an array, so {@link #levelAt} is a
 * binary search rather than a loop of {@code Math.pow} calls. This runs on every XP gain of every
 * player and on every GUI redraw; it has to be cheap.
 *
 * <h2>Shapes</h2>
 *
 * <pre>
 *   linear        base * level
 *   polynomial    base * level^factor          the default; a gentle, familiar ramp
 *   exponential   base * factor^(level-1)      steep, for short prestige-style tracks
 *   table         an explicit list, one entry per level
 * </pre>
 */
public final class XpCurve {

    /**
     * Cumulative XP required to <em>reach</em> each level. Index {@code n} holds the total for level
     * {@code n + 1}, so {@code thresholds[0]} is always 0 — level 1 costs nothing.
     */
    private final long[] thresholds;

    private final int maxLevel;

    private XpCurve(long[] thresholds) {
        this.thresholds = thresholds;
        this.maxLevel = thresholds.length;
    }

    public int maxLevel() {
        return maxLevel;
    }

    /**
     * The level this much total XP buys, clamped to the job's maximum.
     *
     * Negative input is treated as zero rather than throwing. XP should never be negative, and the
     * service refuses to make it so, but a corrupted stored value must render as "level 1" instead
     * of taking down whatever was drawing the GUI.
     */
    public int levelAt(long totalXp) {
        if (totalXp <= 0L) {
            return 1;
        }

        int low = 0;
        int high = thresholds.length - 1;

        while (low < high) {
            int middle = (low + high + 1) >>> 1;

            if (thresholds[middle] <= totalXp) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        return low + 1;
    }

    /** Cumulative XP needed to reach a level. Clamped, so out-of-range input cannot throw. */
    public long totalXpForLevel(int level) {
        int index = Math.max(0, Math.min(level, maxLevel) - 1);
        return thresholds[index];
    }

    /** XP still needed for the next level, or 0 at the cap. Drives the progress bar. */
    public long xpToNextLevel(long totalXp) {
        int level = levelAt(totalXp);

        if (level >= maxLevel) {
            return 0L;
        }

        return Math.max(0L, thresholds[level] - totalXp);
    }

    /**
     * How far through the current level this much XP is, from 0.0 to 1.0.
     *
     * Returns 1.0 at the cap so a maxed job renders as a full bar rather than an empty one.
     */
    public double progressWithinLevel(long totalXp) {
        int level = levelAt(totalXp);

        if (level >= maxLevel) {
            return 1.0d;
        }

        long start = thresholds[level - 1];
        long end = thresholds[level];
        long span = end - start;

        return span <= 0L ? 1.0d : Math.min(1.0d, Math.max(0.0d, (double) (totalXp - start) / span));
    }

    // ─── Parsing ──────────────────────────────────────────────────────────────────────────────

    /**
     * Builds a curve from config, falling back to a sane polynomial when the section is unusable.
     *
     * Never returns null and never throws. A job with a broken curve still loads and is playable on
     * the default ramp, with the problem named in the console — the alternative is a job that
     * silently disappears from the server because one number was a string.
     *
     * @param where human-readable location for warnings, e.g. {@code jobs.yml → miner}
     */
    public static XpCurve parse(ConfigurationSection section, int maxLevel, String where, Logger logger) {
        int levels = clampMaxLevel(maxLevel, where, logger);

        if (section == null) {
            return polynomial(levels, 100.0d, 1.5d);
        }

        String type = section.getString("type", "polynomial").trim().toLowerCase(Locale.ROOT);
        double base = section.getDouble("base", 100.0d);
        double factor = section.getDouble("factor", 1.5d);

        if (base <= 0.0d) {
            logger.warning(where + ": xp-curve base must be positive, was " + base + ". Using 100.");
            base = 100.0d;
        }

        return switch (type) {
            case "linear" -> linear(levels, base);
            case "exponential" -> exponential(levels, base, sanitiseFactor(factor, 1.15d, where, logger));
            case "table" -> table(section.getLongList("levels"), levels, where, logger);
            case "polynomial" -> polynomial(levels, base, sanitiseFactor(factor, 1.5d, where, logger));
            default -> {
                logger.warning(where + ": unknown xp-curve type \"" + type
                        + "\". Known types are linear, polynomial, exponential, table. Using polynomial.");
                yield polynomial(levels, base, 1.5d);
            }
        };
    }

    private static XpCurve linear(int levels, double base) {
        return build(levels, level -> Math.round(base * level));
    }

    private static XpCurve polynomial(int levels, double base, double factor) {
        return build(levels, level -> Math.round(base * Math.pow(level, factor)));
    }

    private static XpCurve exponential(int levels, double base, double factor) {
        return build(levels, level -> Math.round(base * Math.pow(factor, level - 1)));
    }

    /**
     * An explicit per-level cost list.
     *
     * A list shorter than the level cap is padded with its last value rather than truncating the
     * job, so an operator who wrote 20 entries for a 30-level job gets a playable job and a warning
     * instead of a job that stops at 20 for reasons the config does not explain.
     */
    private static XpCurve table(List<Long> costs, int levels, String where, Logger logger) {
        if (costs == null || costs.isEmpty()) {
            logger.warning(where + ": xp-curve type is \"table\" but \"levels\" is empty. Using polynomial.");
            return polynomial(levels, 100.0d, 1.5d);
        }

        if (costs.size() < levels - 1) {
            logger.warning(where + ": xp-curve table has " + costs.size() + " entries for "
                    + levels + " levels. The last value is repeated for the remainder.");
        }

        return build(levels, level -> {
            int index = Math.min(level - 1, costs.size() - 1);
            return Math.max(1L, costs.get(index));
        });
    }

    /**
     * Accumulates per-level costs into cumulative thresholds, saturating rather than overflowing.
     *
     * An exponential curve with a careless factor reaches {@link Long#MAX_VALUE} within about ninety
     * levels. Saturating means those levels become unreachable, which is the operator's own doing and
     * visible in the GUI; wrapping would make them *instantly* reachable, which looks like an exploit
     * and would be reported as one.
     */
    private static XpCurve build(int levels, java.util.function.IntToLongFunction costOfLevel) {
        long[] thresholds = new long[levels];
        long running = 0L;

        for (int level = 2; level <= levels; level++) {
            long cost = Math.max(1L, costOfLevel.applyAsLong(level - 1));

            running = running > Long.MAX_VALUE - cost ? Long.MAX_VALUE : running + cost;
            thresholds[level - 1] = running;
        }

        return new XpCurve(thresholds);
    }

    private static int clampMaxLevel(int requested, String where, Logger logger) {
        if (requested < 1) {
            logger.warning(where + ": max-level must be at least 1, was " + requested + ". Using 1.");
            return 1;
        }

        if (requested > 1000) {
            logger.warning(where + ": max-level " + requested + " is above the 1000 cap. Using 1000.");
            return 1000;
        }

        return requested;
    }

    private static double sanitiseFactor(double factor, double fallback, String where, Logger logger) {
        if (factor <= 0.0d || Double.isNaN(factor) || Double.isInfinite(factor)) {
            logger.warning(where + ": xp-curve factor must be a positive number, was " + factor
                    + ". Using " + fallback + ".");
            return fallback;
        }

        return factor;
    }
}
