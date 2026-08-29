package org.robtic.minecraft.statistics.events;

import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;

import java.util.Set;
import java.util.UUID;

/**
 * One or more of a player's statistics went back to their defaults.
 *
 * <h2>One event for a reset, not one per statistic</h2>
 *
 * A daily rollover clears every daily statistic at once, and {@code resetAll} clears the lot. Firing
 * a {@link StatisticChangedEvent} for each would mean a listener that maintains a leaderboard rebuilt
 * it several hundred times for a single logical event — and would make "was this a reset or did the
 * player actually lose a thousand blocks" unanswerable.
 *
 * So a reset is its own event, carrying the ids it affected. Listeners that care about individual
 * changes ignore it; listeners that hold derived state rebuild once.
 *
 * @see Cause for what triggered it
 */
public final class StatisticResetEvent extends Event {

    /** Why the reset happened. Listeners frequently want to treat these differently. */
    public enum Cause {
        /** A statistic's own {@code reset} policy came due — a daily, weekly or monthly rollover. */
        POLICY,
        /** A session-scoped statistic cleared as the player's data loaded. */
        SESSION_START,
        /** Deliberate: an operator command, or another system calling the API. */
        MANUAL
    }

    private static final HandlerList HANDLERS = new HandlerList();

    private final UUID playerId;
    private final Set<String> statisticIds;
    private final Cause cause;

    public StatisticResetEvent(UUID playerId, Set<String> statisticIds, Cause cause) {
        this.playerId = playerId;
        this.statisticIds = Set.copyOf(statisticIds);
        this.cause = cause;
    }

    public static boolean hasListeners() {
        return HANDLERS.getRegisteredListeners().length > 0;
    }

    public UUID getPlayerId() {
        return playerId;
    }

    /** Every statistic id that was cleared. Never empty — the service does not fire an empty reset. */
    public Set<String> getStatisticIds() {
        return statisticIds;
    }

    public Cause getCause() {
        return cause;
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
