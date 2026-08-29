package org.robtic.minecraft.progression.workspace;

import org.bukkit.entity.Player;

import java.util.List;

/**
 * How a future system plugs into workspaces without this package changing.
 *
 * <h2>The seam the brief actually asks for</h2>
 *
 * Reputation, contracts, collections, NPC memory, events, badges, statistics, licences, dungeons and
 * pets are all queued to build on workspaces. If each of them needs a field on {@link Workspace}, a
 * case in the claim path and a line in the GUI, then the workspace core is edited ten more times and
 * stops being a foundation — it becomes the file that knows about everything.
 *
 * An extension instead observes the lifecycle and contributes to the UI. Its own state lives in
 * {@link Workspace#extras}, which round-trips untouched, so it needs no schema change either.
 *
 * <h2>Contract</h2>
 *
 * Every method runs on the main thread and must not throw — the service calls extensions inside
 * operations that are otherwise atomic, and an extension that threw mid-upgrade would be the one way
 * to produce the half-updated state this design rules out. Failures are caught and logged; the
 * operation continues.
 *
 * Nothing here may block. An extension needing I/O does it asynchronously and reconciles later.
 */
public interface WorkspaceExtension {

    /** Short lowercase name, used in log lines and as the prefix for its {@code extras} keys. */
    String name();

    /**
     * A workspace has just been claimed and persisted.
     *
     * Called after the claim has fully committed, not during it — so an extension can rely on the
     * workspace existing, and cannot cause a claim to half-fail.
     */
    default void onClaimed(Workspace workspace, Player owner) {
    }

    /**
     * A workspace has been upgraded.
     *
     * @param from the tier it was at; {@code workspace.level()} is where it is now
     */
    default void onUpgraded(Workspace workspace, int from, Player owner) {
    }

    /**
     * A workspace is about to be released, with its data still intact.
     *
     * The only chance to read state that is about to be gone. Called before anything is removed.
     */
    default void onReleasing(Workspace workspace) {
    }

    /** Services were suspended for unpaid tax, or restored when it was paid. */
    default void onSuspensionChanged(Workspace workspace, boolean suspended) {
    }

    /**
     * Maintenance was collected.
     *
     * Separate from {@link #onSuspensionChanged}, which only fires when a workspace was actually
     * suspended — most payments are made before it comes to that, and an extension that inferred
     * "paid" from "restored" would miss every one of them.
     *
     * @param amount what was taken, so a listener can total it rather than count occurrences
     */
    default void onTaxPaid(Workspace workspace, double amount) {
    }

    /**
     * Extra lines for the workspace's information panel.
     *
     * How a system surfaces itself to a player without the GUI importing it — a reputation module
     * returns a standing line, a contracts module returns how many are active. Legacy {@code &}
     * codes are accepted.
     *
     * Must be cheap: this is called on every redraw of the panel.
     */
    default List<String> describe(Workspace workspace) {
        return List.of();
    }

    /**
     * Whether this extension permits an upgrade.
     *
     * A veto is a full stop, not a delay: the upgrade does not happen and nothing is charged. Meant
     * for a system that gates progression on its own state — a reputation requirement, an unfinished
     * contract — rather than for ordinary refusals, which belong in the service.
     *
     * @return empty to permit, or a player-facing reason to refuse
     */
    default java.util.Optional<String> vetoUpgrade(Workspace workspace, int toLevel) {
        return java.util.Optional.empty();
    }
}
