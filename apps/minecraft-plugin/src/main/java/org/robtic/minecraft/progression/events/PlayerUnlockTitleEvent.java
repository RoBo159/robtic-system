package org.robtic.minecraft.progression.events;

import org.bukkit.event.Cancellable;
import org.bukkit.event.HandlerList;
import org.robtic.minecraft.progression.titles.Title;

import java.util.UUID;

/**
 * A player is about to gain ownership of a title.
 *
 * Fired before the grant, and cancellable, so another system can veto one — a seasonal plugin
 * refusing to hand out last season's titles, for instance. Cancelling means the player never owns
 * it: no storage write, no message, no LuckPerms change.
 *
 * <h2>Fires once per title, not once per attempt</h2>
 *
 * Grants arrive from several directions and are deliberately idempotent — a level-up re-checking its
 * milestones, an admin command, a replayed write after an outage. The service checks ownership
 * first, so a listener sees this event only on the transition and can safely announce it, log it or
 * pay a reward without deduplicating.
 */
public final class PlayerUnlockTitleEvent extends ProgressionPlayerEvent implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Title title;
    private final String reason;
    private boolean cancelled;

    /**
     * @param reason short machine-readable cause, e.g. {@code job:miner:level:10} or {@code admin}.
     *               Free text on purpose — the set of things that can grant a title is open, and an
     *               enum here would need editing every time a new system started granting them
     */
    public PlayerUnlockTitleEvent(UUID playerId, Title title, String reason) {
        super(playerId);
        this.title = title;
        this.reason = reason;
    }

    public Title getTitle() {
        return title;
    }

    public String getReason() {
        return reason;
    }

    @Override
    public boolean isCancelled() {
        return cancelled;
    }

    @Override
    public void setCancelled(boolean cancel) {
        this.cancelled = cancel;
    }

    @Override
    public HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
