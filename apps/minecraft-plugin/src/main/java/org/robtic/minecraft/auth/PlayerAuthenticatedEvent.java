package org.robtic.minecraft.auth;

import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;

/**
 * Fired once a player has proved who they are and their restrictions have been lifted.
 *
 * <h2>Not cancellable</h2>
 *
 * By the time this fires the password or session has already been accepted by the API, which is the
 * authority. A veto here could not un-verify them; it could only leave a verified player restricted
 * with no way to try again, which is the one outcome an authentication system must never produce.
 * A module that wants to refuse somebody entry should do it by other means — a ban, a whitelist —
 * not by pretending their password was wrong.
 *
 * Always fired on the main thread.
 */
public final class PlayerAuthenticatedEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    /** How a player got in, which listeners generally do care about. */
    public enum Method {
        /** They typed their password. */
        PASSWORD,
        /** A stored session was still valid, so they were never asked. */
        SESSION,
        /** A password change on Discord authenticated them where they stood. */
        RECOVERY,
        /** An administrator let them in. */
        ADMIN
    }

    private final Player player;
    private final Method method;

    public PlayerAuthenticatedEvent(Player player, Method method) {
        this.player = player;
        this.method = method;
    }

    public Player getPlayer() {
        return player;
    }

    public Method getMethod() {
        return method;
    }

    /**
     * True when the player was let straight in on a stored session.
     *
     * The distinction most listeners want: a welcome message worth showing on a real login is noise
     * on every reconnect.
     */
    public boolean isResumed() {
        return method == Method.SESSION;
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
