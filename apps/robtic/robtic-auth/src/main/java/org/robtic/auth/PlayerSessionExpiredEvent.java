package org.robtic.auth;

import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;

import java.util.UUID;

/**
 * Fired when a session stops being proof of anything: it lapsed, or something revoked it.
 *
 * <h2>Carries a UUID, not a Player</h2>
 *
 * Deliberately, and it is the reason this event exists separately from
 * {@link PlayerUnauthenticatedEvent}. A session most often ends while its owner is offline — that is
 * what a thirty-day expiry means — and there is no {@code Player} to hand a listener. Anything that
 * needs the online player should listen to {@code PlayerUnauthenticatedEvent}, which fires with one
 * when a revocation catches somebody in the world.
 *
 * Always fired on the main thread.
 */
public final class PlayerSessionExpiredEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    /** What ended the session. */
    public enum Cause {
        /** It reached its expiry. */
        EXPIRED,
        /** The password changed, which invalidates every session by design. */
        PASSWORD_CHANGED,
        /** The account was unlinked. */
        UNLINKED,
        /** An administrator revoked it. */
        ADMIN
    }

    private final UUID uuid;
    private final String sessionId;
    private final Cause cause;

    public PlayerSessionExpiredEvent(UUID uuid, String sessionId, Cause cause) {
        this.uuid = uuid;
        this.sessionId = sessionId;
        this.cause = cause;
    }

    public UUID getUuid() {
        return uuid;
    }

    /** The session that ended, or null when every session for the player was revoked at once. */
    public String getSessionId() {
        return sessionId;
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
