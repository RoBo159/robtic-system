package org.robtic.minecraft.progression.storage;

import org.robtic.minecraft.progression.jobs.PlayerJobs;
import org.robtic.minecraft.progression.titles.PlayerTitles;

/**
 * Everything the progression system stores about one player, in one value.
 *
 * <h2>One record, one write</h2>
 *
 * Titles and jobs are separate systems and stay separate in code, but they are saved together. A
 * job level-up frequently grants a title, and splitting that into two writes creates a window where
 * one landed and the other did not — a player with a title for a level they are not recorded as
 * having, or the reverse. Neither is catastrophic, but both are the kind of inconsistency that
 * accumulates quietly and is impossible to explain later.
 *
 * The cost is that a title change also rewrites the job block. That is a few hundred bytes on an
 * operation a player performs a handful of times a session, which is not worth the integrity.
 *
 * @param titles what they own and wear
 * @param jobs   what they work and how far along they are
 */
public record PlayerProgression(PlayerTitles titles, PlayerJobs jobs) {

    /**
     * A player with nothing.
     *
     * Also what a failed load degrades to. That choice deserves stating plainly: if storage is
     * unreachable, a player is served an empty progression rather than being refused entry. The
     * protection against that becoming data loss is in {@link ProgressionRepository}, which refuses
     * to save a record it never successfully loaded — so an outage shows a player an empty job list
     * temporarily, and never overwrites their real one with it.
     */
    public static final PlayerProgression EMPTY = new PlayerProgression(PlayerTitles.EMPTY, PlayerJobs.EMPTY);

    public PlayerProgression withTitles(PlayerTitles next) {
        return new PlayerProgression(next, jobs);
    }

    public PlayerProgression withJobs(PlayerJobs next) {
        return new PlayerProgression(titles, next);
    }
}
