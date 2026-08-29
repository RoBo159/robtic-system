package org.robtic.minecraft.auth;

import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;

/**
 * Fired when a successful authentication opens a new session.
 *
 * Distinct from {@link PlayerAuthenticatedEvent} because the two do not always coincide: resuming an
 * existing session authenticates a player without creating one, and this fires only when a new
 * session actually begins. A listener counting real logins wants this one; a listener lifting
 * restrictions wants the other.
 *
 * Always fired on the main thread.
 */
public final class PlayerSessionCreatedEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Player player;
    private final String sessionId;
    private final long expiresAt;

    /** @param expiresAt epoch milliseconds, as the API reported it. */
    public PlayerSessionCreatedEvent(Player player, String sessionId, long expiresAt) {
        this.player = player;
        this.sessionId = sessionId;
        this.expiresAt = expiresAt;
    }

    public Player getPlayer() {
        return player;
    }

    public String getSessionId() {
        return sessionId;
    }

    public long getExpiresAt() {
        return expiresAt;
    }

    /** How long the session has left, in milliseconds. */
    public long getRemainingMillis() {
        return Math.max(0L, expiresAt - System.currentTimeMillis());
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
