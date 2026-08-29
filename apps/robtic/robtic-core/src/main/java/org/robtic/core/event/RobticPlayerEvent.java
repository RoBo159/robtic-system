package org.robtic.core.event;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;

import java.util.Optional;
import java.util.UUID;

/**
 * Base for every Robtic event about a player who may or may not be online.
 *
 * <h2>Why not {@code PlayerEvent}</h2>
 *
 * Bukkit's {@code PlayerEvent} requires a live {@link Player}, and a great deal of what this
 * ecosystem does happens without one. An admin grants a title to an offline account; a queued API
 * write is replayed minutes after the player disconnected; a licence lapses while its owner is
 * asleep; a job is stripped from someone who resigned and logged off. Requiring a {@code Player}
 * would mean those paths either fire no event at all — leaving listeners with an incomplete picture
 * — or fabricate one.
 *
 * So the identity is a {@link UUID}, which always exists, and the entity is an {@link Optional} that
 * a listener checks before touching the world. Listeners that only care about online players write
 * one {@code ifPresent}; listeners maintaining their own records get every event.
 *
 * <h2>Why this is in Core</h2>
 *
 * It began life as the progression system's event base. It is here now because every plugin in the
 * ecosystem needs the same shape, and each defining its own would mean a listener that wants "any
 * Robtic event about this player" has nothing common to catch. Shared events belong to Core by the
 * same rule that puts the service registry here: anything two feature plugins would otherwise have
 * to agree on privately.
 *
 * <h2>Always fired on the main thread</h2>
 *
 * Bukkit's event bus is not thread-safe for synchronous events, and these are all synchronous.
 * Services fire them from API callbacks, which the gateway has already handed back to the tick — so
 * this holds without any of them having to think about it.
 */
public abstract class RobticPlayerEvent extends Event {

    private final UUID playerId;

    protected RobticPlayerEvent(UUID playerId) {
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
