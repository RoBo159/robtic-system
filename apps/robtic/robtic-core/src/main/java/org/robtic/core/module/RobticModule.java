package org.robtic.core.module;

/**
 * One self-contained part of a plugin, with a lifecycle the plugin drives.
 *
 * <h2>Modules inside plugins, still</h2>
 *
 * Splitting the monolith into ten plugins does not make each plugin one lump. RobticJobs will hold
 * professions, workspaces, selling and NPCs; RobticCore will hold statistics, titles, licences and
 * the economy. Each of those is a module, started in dependency order and stopped in reverse, so a
 * module never has to know what else exists — only what it was injected with.
 *
 * This is the same contract the monolith's progression system already uses, kept deliberately
 * identical so migrating those modules is a package move rather than a rewrite.
 *
 * <h2>Contract</h2>
 *
 * All three methods run on the main thread. {@link #enable()} must not block on I/O — load
 * asynchronously and degrade until the data arrives. Every method must tolerate a missing optional
 * dependency: a module whose hook is absent turns that feature off and says so once, rather than
 * throwing during boot and taking its plugin down.
 */
public interface RobticModule {

    /** Short lowercase name, used in log lines and in the module's own debug output. */
    String name();

    /** Registers listeners, commands and services. Never blocks. */
    void enable();

    /**
     * Re-reads configuration.
     *
     * Called after every file has been re-parsed, so a module may read another's settings without
     * worrying about which reloaded first. Must leave the module usable even if the new
     * configuration is invalid — the previous values stay in effect, which beats a reload that
     * empties the registries.
     */
    default void reload() {
    }

    /**
     * Releases everything the module holds.
     *
     * Anything with a presence in the world — NPCs, boss bars, open menus — is removed here, because
     * leaving it behind means the next start finds duplicates it cannot tell from the real thing.
     */
    default void disable() {
    }
}
