package org.robtic.minecraft.license.api;

import org.bukkit.inventory.ItemStack;

import java.time.Duration;

/**
 * One licence item a player actually holds, and where it is.
 *
 * <h2>The item is the record</h2>
 *
 * There is no database row saying a player owns a licence. The item in their inventory is the proof,
 * and the dates it carries are that copy's dates — so two players holding the same licence expire
 * independently, a licence given away takes its remaining time with it, and nothing has to be kept
 * in step with anything.
 *
 * That is also why this carries the {@link #stack}: renewal writes a new expiry into the very item
 * that was found, rather than issuing a replacement. A player's licence keeps whatever else is on it
 * and does not become a different object in their inventory while they are looking at it.
 *
 * @param license  what kind of licence it is
 * @param stack    the item itself, so a renewal can be written back into it
 * @param slot     where it was found; see {@link Location}
 * @param index    the slot index within that inventory, so the item can be written back exactly
 * @param issuedAt epoch millis it was issued
 * @param expiresAt epoch millis it lapses, or 0 for a licence that never expires
 */
public record LicenseHolding(
        License license,
        ItemStack stack,
        Location slot,
        int index,
        long issuedAt,
        long expiresAt
) {

    /** Where a licence was found. Kept because a renewal has to write back to the right inventory. */
    public enum Location {
        /** Main inventory, hotbar, armour slots or offhand — anything in the player's own inventory. */
        INVENTORY,
        /** The player's ender chest. */
        ENDER_CHEST
    }

    /** Whether this copy never expires. */
    public boolean permanent() {
        return expiresAt <= 0L;
    }

    /** Whether it has run out. Always false for a permanent licence. */
    public boolean expired(long now) {
        return !permanent() && now >= expiresAt;
    }

    public LicenseStatus status(long now) {
        return expired(now) ? LicenseStatus.EXPIRED : LicenseStatus.VALID;
    }

    /**
     * How long is left, or zero once it has lapsed.
     *
     * A permanent licence returns zero as well, which callers distinguish with {@link #permanent()}
     * rather than by treating zero as a sentinel — "no time left" and "no expiry" render as very
     * different things and must not be confused.
     */
    public Duration remaining(long now) {
        return permanent() ? Duration.ZERO : Duration.ofMillis(Math.max(0L, expiresAt - now));
    }

    /**
     * What this copy's expiry becomes after a renewal.
     *
     * <h2>Extended from now, not from the old expiry, once it has lapsed</h2>
     *
     * Renewing a licence that still has a week on it adds the renewal period to that week — nobody
     * should lose time by renewing early. Renewing one that expired a month ago starts from now
     * instead, because adding a period to a date in the past can produce an expiry that is still in
     * the past, and a player who has just paid would find their licence still dead.
     */
    public long renewedExpiry(long now, Duration period) {
        long base = Math.max(now, expiresAt);
        return base + period.toMillis();
    }
}
