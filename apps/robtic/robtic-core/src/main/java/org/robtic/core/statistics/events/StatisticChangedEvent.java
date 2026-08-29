package org.robtic.core.statistics.events;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.statistics.api.StatisticDefinition;

import java.util.Optional;
import java.util.UUID;

/**
 * A player's value for a statistic changed.
 *
 * <h2>This is how everything else stays out of the counters</h2>
 *
 * A badge system does not count blocks; it listens here and reacts when {@code blocks_broken} passes
 * a threshold. A title system does the same. A leaderboard invalidates a cache. None of them needs a
 * counter of its own, and none of them needs the statistics module to know they exist — which is the
 * whole design goal.
 *
 * <h2>Not cancellable, and fired after the fact</h2>
 *
 * Statistics record what happened. A listener that could cancel one would be deciding that something
 * which already occurred did not occur, and every reader downstream would disagree about reality.
 * Systems that want to prevent an action cancel the action's own event.
 *
 * <h2>The cost, and why it is bearable</h2>
 *
 * Statistics are written thousands of times a second across a busy server, and a Bukkit event
 * dispatch is not free. So the service checks {@link #hasListeners()} before constructing one: with
 * nothing listening — the default — the entire cost of eventing is reading an array length, and no
 * object is allocated at all. The cost only appears once something actually wants the information.
 *
 * A listener registered here is therefore on the hot path by definition. Keep it to a comparison.
 */
public final class StatisticChangedEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    private final UUID playerId;
    private final StatisticDefinition definition;
    private final long previous;
    private final long current;
    private final String previousText;
    private final String currentText;

    /** A change to a numeric statistic. */
    public StatisticChangedEvent(UUID playerId, StatisticDefinition definition, long previous, long current) {
        this(playerId, definition, previous, current, null, null);
    }

    /** A change to a text statistic. */
    public StatisticChangedEvent(
            UUID playerId, StatisticDefinition definition, String previous, String current) {
        this(playerId, definition, 0L, 0L, previous, current);
    }

    private StatisticChangedEvent(
            UUID playerId,
            StatisticDefinition definition,
            long previous,
            long current,
            String previousText,
            String currentText
    ) {
        this.playerId = playerId;
        this.definition = definition;
        this.previous = previous;
        this.current = current;
        this.previousText = previousText;
        this.currentText = currentText;
    }

    /**
     * Whether anything is listening.
     *
     * Checked by the caller before building the event. See the class comment for why that matters
     * here more than anywhere else in this plugin.
     */
    public static boolean hasListeners() {
        return HANDLERS.getRegisteredListeners().length > 0;
    }

    public UUID getPlayerId() {
        return playerId;
    }

    /** The live entity, when they are online. Absent for a change made to an offline account. */
    public Optional<Player> getPlayer() {
        return Optional.ofNullable(Bukkit.getPlayer(playerId));
    }

    /** The statistic that changed, with all of its metadata. */
    public StatisticDefinition getDefinition() {
        return definition;
    }

    public String getStatisticId() {
        return definition.id();
    }

    /** The stored value before the change. Zero for a text statistic. */
    public long getPrevious() {
        return previous;
    }

    /** The stored value after the change. Zero for a text statistic. */
    public long getCurrent() {
        return current;
    }

    /** How much it moved by, saturating. Negative for a decrease. */
    public long getDelta() {
        return current - previous;
    }

    /** The text before the change, for a text statistic. */
    public Optional<String> getPreviousText() {
        return Optional.ofNullable(previousText);
    }

    public Optional<String> getCurrentText() {
        return Optional.ofNullable(currentText);
    }

    /**
     * Whether the value crossed a threshold with this change.
     *
     * The check nearly every listener wants, written once here rather than subtly wrongly in each of
     * them. "Passed 1,000 blocks" must fire exactly once even when a single change jumps from 900 to
     * 1,100, and must not fire again at 1,200.
     */
    public boolean crossed(long threshold) {
        return previous < threshold && current >= threshold;
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
