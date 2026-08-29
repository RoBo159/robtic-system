package org.robtic.auth;

import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;

/**
 * Fired when a player's Discord link is completed and the API has told this server about it.
 *
 * <h2>Fired on the game server, decided on Discord</h2>
 *
 * The link is created by the API when somebody submits the Link Account modal, and the player is
 * usually standing in the Link World when it happens. This event is the moment that news reaches the
 * server they are on — so it fires on a notification from the API, not on a command, and a player
 * who was offline when their link completed sees it on their next join instead.
 *
 * Not cancellable: the link already exists in the database by the time this fires, and a veto here
 * would leave the two sides disagreeing about whether the player is linked.
 *
 * Always fired on the main thread.
 */
public final class PlayerLinkedEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Player player;
    private final String discordId;
    private final boolean hasPassword;

    /**
     * @param hasPassword whether the completed link also set a password. True for the RobticAuth
     *                    flow, where linking and choosing a password are one modal; false for a link
     *                    made by any other means, which leaves the player to set one through
     *                    recovery. Listeners deciding whether to send somebody to the login screen
     *                    or straight to spawn need the difference.
     */
    public PlayerLinkedEvent(Player player, String discordId, boolean hasPassword) {
        this.player = player;
        this.discordId = discordId;
        this.hasPassword = hasPassword;
    }

    public Player getPlayer() {
        return player;
    }

    public String getDiscordId() {
        return discordId;
    }

    public boolean hasPassword() {
        return hasPassword;
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
