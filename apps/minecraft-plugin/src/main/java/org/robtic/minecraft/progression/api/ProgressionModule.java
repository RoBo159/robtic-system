package org.robtic.minecraft.progression.api;

/**
 * One self-contained part of the progression system, with a lifecycle the container drives.
 *
 * Titles, Jobs, Workplaces, NPCs and Discovery are each one of these. The container starts them in
 * dependency order, reloads them all when configs change and stops them in reverse — so a module
 * never has to know what else exists, only what it was injected with.
 *
 * <h2>Why this exists rather than the plugin calling each service by name</h2>
 *
 * The stated goal is that this can move into separate plugins later without rewriting the
 * architecture. The thing that makes that hard is usually not the code inside a feature but the two
 * hundred lines of bespoke wiring in the main class that only work in one order. A uniform lifecycle
 * means the extraction is "move the package and register the module", not "reconstruct the boot
 * sequence".
 *
 * <h2>Contract</h2>
 *
 * All three methods run on the main thread. {@link #enable()} must not block on I/O — load
 * asynchronously and degrade until the data arrives, as the rest of this plugin does. Every method
 * must tolerate being called when a dependency is missing: a module whose optional hook is absent
 * disables the feature and says so once, rather than throwing during boot and taking the plugin
 * down with it.
 */
public interface ProgressionModule {

    /** Short lowercase name used in log lines and in the module's own debug output. */
    String name();

    /** Registers listeners, commands and providers. Never blocks. */
    void enable();

    /**
     * Re-reads configuration.
     *
     * Called after every file has been re-parsed, so a module may read another module's settings
     * without worrying about which of them reloaded first. Must leave the module usable even if the
     * new configuration turns out to be invalid — the previous values stay in effect, which is
     * better than a reload that empties the registries.
     */
    default void reload() {
    }

    /**
     * Releases everything the module holds.
     *
     * Called during shutdown and on a plugin disable. Anything with a presence in the world — NPC
     * entities, boss bars, open menus — is removed here, because leaving it behind means the next
     * start finds duplicates it cannot tell from the real thing.
     */
    default void disable() {
    }
}
