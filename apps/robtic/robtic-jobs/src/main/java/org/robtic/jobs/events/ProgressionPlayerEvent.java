package org.robtic.jobs.events;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;

import java.util.Optional;
import java.util.UUID;

/**
 * Base for every progression event: something happened to a player who may or may not be online.
 *
 * <h2>Why not {@code PlayerEvent}</h2>
 *
 * Bukkit's {@code PlayerEvent} requires a live {@link Player}, and half of what this system does
 * happens without one. An admin grants a title to an offline account; a queued API write is replayed
 * minutes after the player disconnected; a job is stripped from someone who resigned and logged off.
 * Forcing a {@code Player} would mean those paths either fire no event at all — leaving listeners
 * with an incomplete picture of progression — or fabricate one.
 *
 * So the identity is a {@link UUID}, which always exists, and the entity is an {@link Optional} that
 * a listener checks before touching the world. Listeners that only care about online players write
 * one {@code ifPresent}; listeners that maintain their own records get every event.
 *
 * <h2>Always fired on the main thread</h2>
 *
 * Bukkit's event bus is not thread-safe for synchronous events, and these are all synchronous. The
 * services fire them from API callbacks, which {@code ApiGateway} has already handed back to the
 * tick — so this holds without any of them thinking about it.
 */
public abstract class ProgressionPlayerEvent extends Event {

    private final UUID playerId;

    protected ProgressionPlayerEvent(UUID playerId) {
        this.playerId = playerId;
    }

    /** The account this happened to. Present whether or not they are connected. */
    public UUID getPlayerId() {
        return playerId;
    }

    /** The live entity, when they are online on this server. */
    public Optional<Player> getPlayer() {
        return Optional.ofNullable(Bukkit.getPlayer(playerId));
    }

    /** Their name if it is known, otherwise the id as text. Only for logging and messages. */
    public String getPlayerName() {
        return Optional.ofNullable(Bukkit.getOfflinePlayer(playerId).getName())
                .orElseGet(playerId::toString);
    }
}
