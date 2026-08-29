package org.robtic.minecraft.license.events;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.robtic.minecraft.license.api.License;

import java.util.Optional;
import java.util.UUID;

/**
 * Base for every licence event: something happened to a player and one licence.
 *
 * <h2>Why not {@code PlayerEvent}</h2>
 *
 * Bukkit's {@code PlayerEvent} requires a live {@link Player}, and several of these fire without
 * one. An admin grants a licence to an offline account; an expiry is noticed while its owner is
 * away; a revocation runs from the console. Forcing a {@code Player} would mean those paths either
 * fire no event at all — leaving listeners with an incomplete picture — or fabricate one.
 *
 * So the identity is a {@link UUID}, which always exists, and the entity is an {@link Optional} a
 * listener checks before touching the world.
 *
 * <h2>Always fired on the main thread</h2>
 *
 * Bukkit's event bus is not thread-safe for synchronous events, and these are all synchronous. Every
 * call site is already on the tick.
 */
public abstract class LicenseEvent extends Event {

    private final UUID playerId;
    private final License license;

    protected LicenseEvent(UUID playerId, License license) {
        this.playerId = playerId;
        this.license = license;
    }

    /** The account this happened to. Present whether or not they are connected. */
    public UUID getPlayerId() {
        return playerId;
    }

    /** The live entity, when they are online on this server. */
    public Optional<Player> getPlayer() {
        return Optional.ofNullable(Bukkit.getPlayer(playerId));
    }

    public License getLicense() {
        return license;
    }

    public String getLicenseId() {
        return license.id();
    }
}
