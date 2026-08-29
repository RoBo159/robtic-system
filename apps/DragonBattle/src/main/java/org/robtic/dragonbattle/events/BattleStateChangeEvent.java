package org.robtic.dragonbattle.events;

import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;
import org.robtic.dragonbattle.battle.BattleContext;
import org.robtic.dragonbattle.battle.BattleState;
import org.robtic.dragonbattle.model.Arena;

/**
 * Fired every time a battle moves between states.
 *
 * <h2>This is the extension point</h2>
 *
 * The state machine sequences the fight and does none of the work: portal generation, beacons,
 * gateways and cinematics all hang off this event. That is what lets a server disable the portal, or
 * add a boss phase, or play a cutscene, without editing the machine — and what will let custom
 * dragons and loot tables be added later without touching any of it.
 *
 * Not cancellable. By the time it fires the transition has happened, and a veto would leave the
 * battle claiming one state while its listeners believed another.
 *
 * Always fired on the main thread.
 */
public final class BattleStateChangeEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Arena arena;
    private final BattleContext context;
    private final BattleState previous;
    private final BattleState current;

    public BattleStateChangeEvent(Arena arena, BattleContext context, BattleState previous, BattleState current) {
        this.arena = arena;
        this.context = context;
        this.previous = previous;
        this.current = current;
    }

    public Arena getArena() {
        return arena;
    }

    public BattleContext getContext() {
        return context;
    }

    public BattleState getPrevious() {
        return previous;
    }

    public BattleState getCurrent() {
        return current;
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
