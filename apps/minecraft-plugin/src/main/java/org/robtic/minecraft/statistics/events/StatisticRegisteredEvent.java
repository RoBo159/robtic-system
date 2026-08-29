package org.robtic.minecraft.statistics.events;

import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.statistics.api.StatisticDefinition;

/**
 * A statistic became available.
 *
 * <h2>What this solves: load order</h2>
 *
 * Plugins enable in an order no single plugin controls. A menu that lists statistics cannot simply
 * read the registry at its own enable and cache the result — a plugin loading after it would register
 * statistics that never appear, and the operator's only clue would be a menu missing entries it has
 * no reason to know about.
 *
 * Listening here removes the ordering problem entirely: whatever registers, whenever it registers,
 * every interested system is told. It also fires for definitions read from {@code statistics.yml} on
 * a reload, so an edited or newly added statistic reaches those systems without a restart.
 *
 * Fired on the main thread, after the definition is in the registry — so a listener may read it back.
 */
public final class StatisticRegisteredEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    private final StatisticDefinition definition;
    private final boolean replacement;

    /**
     * @param replacement whether this replaced an existing definition with the same id, which is what
     *                    a reload produces. A listener rebuilding a view wants to know the difference
     *                    between "something new appeared" and "something changed shape"
     */
    public StatisticRegisteredEvent(StatisticDefinition definition, boolean replacement) {
        this.definition = definition;
        this.replacement = replacement;
    }

    public static boolean hasListeners() {
        return HANDLERS.getRegisteredListeners().length > 0;
    }

    public StatisticDefinition getDefinition() {
        return definition;
    }

    public String getStatisticId() {
        return definition.id();
    }

    public boolean isReplacement() {
        return replacement;
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
