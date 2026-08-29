package org.robtic.minecraft.progression.events;

import org.bukkit.event.HandlerList;
import org.robtic.minecraft.progression.jobs.Job;

import java.util.UUID;

/**
 * A player's job level has increased.
 *
 * <h2>Not cancellable</h2>
 *
 * The level is derived from stored XP, not stored itself — see {@code XpCurve}. There is nothing to
 * cancel: by the time this fires the XP is already recorded, and "cancelling" could only mean taking
 * it away again, which is a different operation with different consequences. A listener that wants
 * to prevent progress should veto the XP, not the level it produced.
 *
 * <h2>May report more than one level at once</h2>
 *
 * A large XP award can cross several thresholds. {@link #getFrom()} and {@link #getTo()} are the
 * bounds rather than adjacent numbers, so a listener paying a per-level reward must loop rather than
 * assume a single step — assuming it is how a player who levelled 4→7 in one go gets paid once.
 */
public final class PlayerJobLevelUpEvent extends ProgressionPlayerEvent {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Job job;
    private final int from;
    private final int to;

    public PlayerJobLevelUpEvent(UUID playerId, Job job, int from, int to) {
        super(playerId);
        this.job = job;
        this.from = from;
        this.to = to;
    }

    public Job getJob() {
        return job;
    }

    /** The level they were, exclusive. */
    public int getFrom() {
        return from;
    }

    /** The level they now are, inclusive. */
    public int getTo() {
        return to;
    }

    /** How many levels were crossed. Always at least 1. */
    public int getLevelsGained() {
        return to - from;
    }

    /** Whether this took them to the job's cap. */
    public boolean isMaxLevel() {
        return to >= job.maxLevel();
    }

    @Override
    public HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
