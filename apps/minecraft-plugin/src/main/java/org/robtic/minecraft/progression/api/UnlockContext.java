package org.robtic.minecraft.progression.api;

import org.bukkit.entity.Player;

import java.util.Optional;
import java.util.OptionalDouble;
import java.util.UUID;

/**
 * Everything an {@link UnlockCondition} is allowed to look at.
 *
 * <h2>Deliberately narrow</h2>
 *
 * A condition gets a player id, an optional live {@link Player} and the attribute router. It does
 * not get the plugin, the job service or the title service. That is the whole reason conditions can
 * be evaluated for offline players, on a GUI redraw, and by systems written years from now: there is
 * nothing in here to couple to.
 *
 * <h2>Why the Player is optional</h2>
 *
 * Conditions are checked in two very different situations. One is a player earning something while
 * standing on the server, where the entity exists. The other is a GUI listing locked titles, or an
 * admin inspecting an offline account — where it does not. A condition that needs the entity (a
 * permission check does) reports "not satisfied" when it is absent rather than throwing, so an
 * offline evaluation degrades to "cannot confirm" instead of crashing the caller.
 */
public interface UnlockContext {

    /** The player being evaluated. Always present — this is the one thing a condition can rely on. */
    UUID playerId();

    /** The live entity, when the player is online on this server. */
    Optional<Player> player();

    /**
     * A numeric attribute published by some other system.
     *
     * @see Attributes for the routing, and {@link AttributeProvider} for why it works this way
     */
    OptionalDouble number(String path);

    /** A textual attribute published by some other system. */
    Optional<String> text(String path);

    /**
     * Builds a context around a player id and the attribute router.
     *
     * A static factory rather than a public record so the interface stays the type everything passes
     * around — a future context that also carries, say, a season or a party would be a second
     * implementation rather than a change to every signature.
     */
    static UnlockContext of(UUID playerId, Optional<Player> player, Attributes attributes) {
        return new UnlockContext() {
            @Override
            public UUID playerId() {
                return playerId;
            }

            @Override
            public Optional<Player> player() {
                return player;
            }

            @Override
            public OptionalDouble number(String path) {
                return attributes.number(playerId, path);
            }

            @Override
            public Optional<String> text(String path) {
                return attributes.text(playerId, path);
            }
        };
    }
}
