package org.robtic.minecraft.license.api;

/**
 * What a player's standing with one licence is, right now.
 *
 * <h2>Three states, and the middle one is the point</h2>
 *
 * A licence that has run out is not the same as one a player never had. The item is still in their
 * inventory, it still says who it belongs to and when it lapsed, and renewing it at the licence NPC
 * restores it — so the fight is over a renewal rather than over finding another one.
 *
 * Every gate in the plugin asks {@link #usable()}, which is false for both of the other two. Nothing
 * has to remember that expired and missing are different unless it wants to say something different
 * about them, which is exactly the split a message wants and a permission check does not.
 */
public enum LicenseStatus {

    /** Held and in date. The only state that permits anything. */
    VALID,

    /** Held, but past its expiry. The item remains; the permission does not. */
    EXPIRED,

    /** Not held at all. */
    MISSING;

    /** Whether the player may act on this licence. */
    public boolean usable() {
        return this == VALID;
    }

    /** Whether the player physically holds the item, whatever state it is in. */
    public boolean held() {
        return this != MISSING;
    }
}
