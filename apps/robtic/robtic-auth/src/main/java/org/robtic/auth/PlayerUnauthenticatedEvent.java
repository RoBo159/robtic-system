package org.robtic.auth;

import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;

/**
 * Fired when a player becomes unauthenticated: on joining without a valid session, and when an
 * administrator or an unlink revokes access from somebody already in the world.
 *
 * <h2>This is where restrictions are applied, not lifted</h2>
 *
 * Every module that limits what an unauthenticated player may do listens here and to
 * {@link PlayerAuthenticatedEvent}, in that order. Restrictions are applied when this fires and
 * removed when that one does, so the answer to "may this player break blocks?" is derived from one
 * state that changes in exactly two places.
 *
 * Not cancellable. Refusing to lock a player out would leave an unverified player with full access,
 * which defeats the system rather than extending it.
 *
 * Always fired on the main thread.
 */
public final class PlayerUnauthenticatedEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    /** Why the player is being asked to authenticate. */
    public enum Reason {
        /** They joined and had no valid session. */
        JOIN,
        /** Their session expired or was revoked while they were online. */
        SESSION_ENDED,
        /** Their account was unlinked, so there is nothing left to authenticate against. */
        UNLINKED,
        /** An administrator revoked their access. */
        ADMIN
    }

    private final Player player;
    private final Reason reason;
    private final boolean linked;

    /**
     * @param linked whether the player has a Discord link at all. False sends them to the Link
     *               World and the {@code /link} flow; true sends them to the login screen. It is
     *               carried on the event so a listener deciding where to put somebody does not have
     *               to ask the API a second time on the join path.
     */
    public PlayerUnauthenticatedEvent(Player player, Reason reason, boolean linked) {
        this.player = player;
        this.reason = reason;
        this.linked = linked;
    }

    public Player getPlayer() {
        return player;
    }

    public Reason getReason() {
        return reason;
    }

    public boolean isLinked() {
        return linked;
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
