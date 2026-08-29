package org.robtic.core.registry;

/**
 * Anything the progression system stores in a {@link Registry} and addresses by a stable string.
 *
 * Titles, jobs, rarities, title sources, unlock condition types and NPC definitions are all this.
 * They have almost nothing else in common, which is the point: {@link Registry} can offer duplicate
 * detection, lookup and validation once instead of each of those types growing its own copy.
 *
 * <h2>The id is the identity</h2>
 *
 * Two values with the same id are the same thing, and a config that defines both is a mistake the
 * operator wants to hear about rather than a silent last-one-wins. Ids are therefore normalised on
 * the way in ({@link Ids#normalise}) so {@code Miner}, {@code miner} and {@code MINER} cannot become
 * three registry entries that a human reads as one.
 */
public interface Identified {

    /**
     * The stable, lowercase, config-facing identifier.
     *
     * Never shown to a player — every {@code Identified} in this system carries a separate display
     * string for that. Renaming a display is a cosmetic edit; renaming an id orphans whatever player
     * data referenced it, which is why the two are kept apart.
     */
    String id();
}
