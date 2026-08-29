package org.robtic.minecraft.progression.workspace;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.progression.api.WorldPoint;
import org.robtic.minecraft.progression.market.JobEconomy;
import org.robtic.minecraft.progression.npc.NpcHandle;
import org.robtic.minecraft.progression.npc.NpcService;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.ToIntFunction;
import java.util.logging.Level;

/**
 * Claiming, upgrading, staffing and releasing workspaces.
 *
 * <h2>Everything that changes ownership or level is atomic</h2>
 *
 * The brief is explicit: an operation that fails partway must leave the previous valid state, not a
 * half-updated one. Each such operation here follows the same shape — validate everything first,
 * build the new state in full, commit it, and on any failure put the previous state back. Nothing is
 * written to the world until the data has committed, so there is never an NPC standing at a
 * workspace that does not exist.
 *
 * <h2>What this does not do</h2>
 *
 * No XP, no levels, no titles, no reputation, no economy rules. It charges through
 * {@link JobEconomy} and knows nothing else about money. Those systems integrate through
 * {@link WorkspaceExtension} or by reading workspaces; none of them belong in here.
 */
public final class WorkspaceService {

    /** Why a claim was refused. */
    public enum ClaimResult {
        SUCCESS,
        DISABLED,
        NOT_READY,
        STRUCTURE_TAKEN,
        ALREADY_OWNS_FOR_PROFESSION,
        LIMIT_REACHED,
        REGION_OVERLAPS,
        REGION_TOO_LARGE,
        WORLD_UNLOADED,
        SAVE_FAILED
    }

    /** Why an upgrade was refused. */
    public enum UpgradeResult {
        SUCCESS,
        NOT_OWNER,
        MAX_LEVEL,
        CANNOT_AFFORD,
        SUSPENDED,
        VETOED,
        SAVE_FAILED
    }

    private final Plugin plugin;
    private final WorkspaceRepository repository;
    private final NpcService npcs;
    private final ToIntFunction<UUID> premiumTier;

    private volatile WorkspaceSettings settings;
    private volatile JobEconomy economy = JobEconomy.NONE;

    /** Registered by future systems; see {@link WorkspaceExtension}. */
    private final List<WorkspaceExtension> extensions = new java.util.concurrent.CopyOnWriteArrayList<>();

    /** What each NPC role does when clicked, registered by whoever owns the role. */
    private final java.util.Map<String, WorkspaceNpcRole.Handler> handlers = new ConcurrentHashMap<>();

    /**
     * Which NPC definition a profession wants for a role, when it wants something other than the
     * role's own.
     *
     * A function of (profession id, role id) rather than a lookup into the job system, for the same
     * reason the storage filter is: this package must not learn that jobs exist. Returns empty for
     * the overwhelmingly common case of "no opinion", and the role's configured NPC is used.
     */
    private volatile java.util.function.BiFunction<String, String, Optional<String>> npcOverride =
            (profession, role) -> Optional.empty();

    /**
     * Keys with an operation in flight — workspace ids while upgrading or paying tax, structure ids
     * while claiming.
     *
     * Guards the "two players click simultaneously" and "one player double-clicks" cases. Every write
     * below is idempotent anyway, but an upgrade and a tax payment both charge money, and being
     * charged twice is visible in a way a redundant map write is not.
     */
    private final Set<String> busy = ConcurrentHashMap.newKeySet();

    /**
     * Takes the operation lock on a key, if it is free.
     *
     * Public because the tax service charges money against a workspace too and must not be able to
     * do so while an upgrade is mid-flight, nor twice for one double-click. Every successful call
     * must be paired with {@link #endExclusive}, including on every failure path.
     *
     * @return false when something else holds it, in which case the caller must not proceed
     */
    public boolean beginExclusive(String key) {
        return busy.add(key);
    }

    public void endExclusive(String key) {
        busy.remove(key);
    }

    public WorkspaceService(
            Plugin plugin,
            WorkspaceRepository repository,
            NpcService npcs,
            WorkspaceSettings settings,
            ToIntFunction<UUID> premiumTier
    ) {
        this.plugin = plugin;
        this.repository = repository;
        this.npcs = npcs;
        this.settings = settings;
        this.premiumTier = premiumTier;
    }

    public WorkspaceRepository repository() {
        return repository;
    }

    public WorkspaceSettings settings() {
        return settings;
    }

    public void settings(WorkspaceSettings replacement) {
        this.settings = replacement;
    }

    public void economy(JobEconomy economy) {
        this.economy = economy == null ? JobEconomy.NONE : economy;
    }

    public void register(WorkspaceExtension extension) {
        extensions.add(extension);
        plugin.getLogger().fine("Registered the workspace extension \"" + extension.name() + "\".");
    }

    /** Registers a per-profession NPC choice. See {@link #npcOverride}. */
    public void npcOverride(java.util.function.BiFunction<String, String, Optional<String>> override) {
        this.npcOverride = override == null ? (profession, role) -> Optional.empty() : override;
    }

    /** Registers what happens when an NPC in a role is clicked. */
    public void handler(String role, WorkspaceNpcRole.Handler handler) {
        handlers.put(role.toLowerCase(java.util.Locale.ROOT), handler);
    }

    public Optional<WorkspaceNpcRole.Handler> handler(String role) {
        return Optional.ofNullable(handlers.get(role.toLowerCase(java.util.Locale.ROOT)));
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    public List<Workspace> ownedBy(UUID owner) {
        return repository.ownedBy(owner);
    }

    public Optional<Workspace> ownedBy(UUID owner, String professionId) {
        return repository.ownedBy(owner, professionId);
    }

    public Optional<Workspace> at(Location location) {
        return repository.at(location);
    }

    public Optional<Workspace> byId(String id) {
        return repository.byId(id);
    }

    public WorkspaceTier tierOf(Workspace workspace) {
        return settings.tier(workspace.level());
    }

    /** How many workspaces this player may own, given their premium tier. */
    public int limitFor(UUID player) {
        return settings.maxWorkspaces(premiumTier.applyAsInt(player));
    }

    /**
     * Whether a player may build at or interact with a location.
     *
     * True when no workspace covers it, which is the common case and must stay cheap. Fails closed
     * while the index is unloaded — see {@link WorkspaceRepository}.
     */
    public boolean mayInteract(Player player, Location location) {
        if (!repository.ready()) {
            return player.hasPermission(BYPASS);
        }

        Optional<Workspace> workspace = repository.at(location);

        return workspace.isEmpty()
                || workspace.get().ownedBy(player.getUniqueId())
                || player.hasPermission(BYPASS);
    }

    /**
     * Whether anything at all may modify blocks here — used for explosions, fire and fluids.
     *
     * <h2>This one fails open, unlike {@link #mayInteract}</h2>
     *
     * A player denied while the index loads sees one refused block break. An environmental check
     * that answered "protected" while the index was unknown would answer that for every location on
     * the server, so no creeper would crater anything and no water would flow anywhere until the
     * load finished. The asymmetry is deliberate: the exposure is a few seconds at boot, before
     * anybody has joined, and the alternative visibly breaks the world for every player at once.
     */
    public boolean isProtected(Location location) {
        return repository.ready() && repository.at(location).isPresent();
    }

    public static final String BYPASS = "robtic.jobs.workspace.bypass";

    // ─── Claiming ─────────────────────────────────────────────────────────────────────────────

    /**
     * Claims a discovered structure as a workspace.
     *
     * Validated in full before anything is created, so every refusal leaves no trace. The NPCs are
     * spawned only after the record has persisted — a failure to save must not leave a building
     * staffed by NPCs for a workspace nobody owns.
     *
     * @param radius      the profession's own protection radius, or zero to use the configured
     *                    server-wide one. The vertical extent is always the server's
     * @param whenClaimed called on the main thread with the new workspace, or empty when the claim
     *                    passed every check and then failed to persist
     */
    public ClaimResult claim(
            Player owner,
            String professionId,
            String structureId,
            WorldPoint anchor,
            int radius,
            java.util.function.Consumer<Optional<Workspace>> whenClaimed
    ) {
        if (!settings.enabled()) {
            return ClaimResult.DISABLED;
        }

        // Held across the whole claim, keyed on the building rather than on the workspace. Keying it
        // on the workspace id was pointless — that id is generated here, so it is unique by
        // construction and the lock could never be contended. The contended thing is the structure:
        // two players clicking recruiters in the same guild hall.
        if (!busy.add(structureId)) {
            return ClaimResult.STRUCTURE_TAKEN;
        }

        ClaimResult result;

        try {
            result = claimChecked(owner, professionId, structureId, anchor, radius, whenClaimed);
        } catch (RuntimeException failure) {
            busy.remove(structureId);
            plugin.getLogger().log(Level.SEVERE,
                    "A workspace claim on " + structureId + " failed unexpectedly", failure);
            return ClaimResult.SAVE_FAILED;
        }

        // Only the success path continues asynchronously, and it releases the lock in its callback.
        // Every refusal is finished by the time it returns here.
        if (result != ClaimResult.SUCCESS) {
            busy.remove(structureId);
        }

        return result;
    }

    private ClaimResult claimChecked(
            Player owner,
            String professionId,
            String structureId,
            WorldPoint anchor,
            int radius,
            java.util.function.Consumer<Optional<Workspace>> whenClaimed
    ) {

        if (!repository.ready()) {
            // Refused rather than claimed into an index that may be about to be replaced by a load
            // that succeeds — which would silently drop the claim.
            return ClaimResult.NOT_READY;
        }

        if (repository.structureClaimed(structureId)) {
            return ClaimResult.STRUCTURE_TAKEN;
        }

        UUID ownerId = owner.getUniqueId();

        if (repository.ownedBy(ownerId, professionId).isPresent()) {
            return ClaimResult.ALREADY_OWNS_FOR_PROFESSION;
        }

        if (repository.ownedBy(ownerId).size() >= limitFor(ownerId)) {
            return ClaimResult.LIMIT_REACHED;
        }

        if (anchor.toLocation().isEmpty()) {
            return ClaimResult.WORLD_UNLOADED;
        }

        WorkspaceRegion region = WorkspaceRegion.around(anchor,
                radius > 0 ? radius : settings.regionRadius(),
                settings.regionDepth(), settings.regionHeight());

        if (region.volume() > settings.maxRegionVolume()) {
            plugin.getLogger().warning("A workspace region of " + region.volume()
                    + " blocks exceeds the configured maximum of " + settings.maxRegionVolume()
                    + ". Lower workspace.yml → region → radius/height.");
            return ClaimResult.REGION_TOO_LARGE;
        }

        if (repository.overlapsExisting(region)) {
            // Two owners with overlapping protection is a state where whoever is checked first wins,
            // which is not a rule anybody could explain to the loser.
            return ClaimResult.REGION_OVERLAPS;
        }

        Workspace workspace = Workspace.create(
                ownerId, professionId, structureId, anchor, region, System.currentTimeMillis());

        repository.put(workspace, saved -> {
            busy.remove(structureId);

            if (!saved) {
                // Never persisted, so it must not stay in memory pretending to be real — a player
                // would build in it and lose everything on the next restart.
                repository.remove(workspace.id());
                whenClaimed.accept(Optional.empty());
                return;
            }

            // The world is touched only now, once the record is safe.
            staffNpcs(workspace);

            notifyExtensions(extension -> extension.onClaimed(workspace, owner));

            whenClaimed.accept(Optional.of(workspace));
        });

        return ClaimResult.SUCCESS;
    }

    // ─── Upgrading ────────────────────────────────────────────────────────────────────────────

    /**
     * Raises a workspace by one tier.
     *
     * <h2>Atomic, and storage is never touched</h2>
     *
     * The player is charged only after every check has passed, the record is committed before the
     * world changes, and a failed save both refunds and restores the previous state. Storage carries
     * across because {@link Workspace#withLevel} copies it — there is deliberately no code path in an
     * upgrade that can reach a player's items.
     *
     * @param whenDone called on the main thread with the outcome
     */
    public void upgrade(Player player, Workspace workspace, java.util.function.Consumer<UpgradeResult> whenDone) {
        if (!workspace.ownedBy(player.getUniqueId()) && !player.hasPermission(BYPASS)) {
            whenDone.accept(UpgradeResult.NOT_OWNER);
            return;
        }

        if (workspace.taxSuspended()) {
            // Upgrading a workspace whose maintenance is unpaid would let a player buy their way past
            // the one consequence the tax system has.
            whenDone.accept(UpgradeResult.SUSPENDED);
            return;
        }

        Optional<WorkspaceTier> next = settings.nextTier(workspace.level());

        if (next.isEmpty()) {
            whenDone.accept(UpgradeResult.MAX_LEVEL);
            return;
        }

        WorkspaceTier target = next.get();

        for (WorkspaceExtension extension : extensions) {
            Optional<String> veto = safeVeto(extension, workspace, target.level());

            if (veto.isPresent()) {
                whenDone.accept(UpgradeResult.VETOED);
                return;
            }
        }

        if (!busy.add(workspace.id())) {
            whenDone.accept(UpgradeResult.SAVE_FAILED);
            return;
        }

        UUID playerId = player.getUniqueId();
        String name = player.getName();
        String workspaceId = workspace.id();

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            // Charged on a worker: the economy crosses a network. Negative amount = a debit.
            boolean paid = !org.robtic.minecraft.util.Robs.isPositive(target.cost())
                    || economy.pay(playerId, name, -target.cost(), "workspace-upgrade:" + workspaceId);

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                if (!paid) {
                    busy.remove(workspaceId);
                    whenDone.accept(UpgradeResult.CANNOT_AFFORD);
                    return;
                }

                // Re-read rather than reusing the snapshot this call started from. The payment
                // crossed a network, and anything that happened on the tick meanwhile — a deposit
                // into storage, an NPC respawned by the repair pass — is in the repository and not
                // in that snapshot. Writing the snapshot back would silently undo it, and for
                // storage that means destroying items during the one operation this system promises
                // can never touch them.
                Optional<Workspace> latest = repository.byId(workspaceId);

                if (latest.isEmpty()) {
                    // Released while the payment was in flight. There is nothing to upgrade, so the
                    // money goes back.
                    busy.remove(workspaceId);
                    refund(playerId, name, target.cost(), workspaceId);
                    whenDone.accept(UpgradeResult.SAVE_FAILED);
                    return;
                }

                Workspace previous = latest.get();
                Workspace upgraded = previous.withLevel(target.level(), System.currentTimeMillis());

                repository.put(upgraded, saved -> {
                    busy.remove(workspaceId);

                    if (!saved) {
                        // Roll the whole thing back: the memory copy returns to what it was, and the
                        // money goes back, because the player was charged for a tier they do not have.
                        repository.rollback(previous);
                        refund(playerId, name, target.cost(), workspaceId);
                        whenDone.accept(UpgradeResult.SAVE_FAILED);
                        return;
                    }

                    // The world changes last, once the record is committed.
                    staffNpcs(upgraded);

                    notifyExtensions(extension ->
                            extension.onUpgraded(upgraded, previous.level(), player));

                    whenDone.accept(UpgradeResult.SUCCESS);
                });
            });
        });
    }

    private void refund(UUID playerId, String name, double amount, String workspaceId) {
        if (!org.robtic.minecraft.util.Robs.isPositive(amount)) {
            return;
        }

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            if (!economy.pay(playerId, name, amount, "workspace-upgrade-refund:" + workspaceId)) {
                // Said loudly. A refund that failed is real money a player is owed, and it needs a
                // human rather than a retry.
                plugin.getLogger().severe("Could not refund " + amount + " to " + name
                        + " after a failed workspace upgrade on " + workspaceId
                        + ". They have been charged and not upgraded — refund this by hand.");
            }
        });
    }

    // ─── Staffing ─────────────────────────────────────────────────────────────────────────────

    /**
     * Spawns whichever NPCs this workspace's tier staffs, and removes the ones it no longer does.
     *
     * Idempotent, and safe to call at any time: it is the claim path, the upgrade path and the repair
     * path all at once. An NPC that was despawned by a chunk purge, removed by an operator, or lost
     * with a backend switch is simply respawned the next time this runs.
     */
    public void staffNpcs(Workspace workspace) {
        Workspace updated = restaff(workspace);

        if (!updated.equals(workspace)) {
            repository.put(updated);
        }
    }

    /**
     * The staffing decision itself, without persisting.
     *
     * Split out so an operation that is already writing the workspace — a suspension, say — commits
     * the level change and the NPC records in one write rather than two, and so the persistence
     * decision lives with the caller that knows whether anything else is changing too.
     *
     * @return the workspace with its NPC records brought up to date; the same instance when nothing
     *         needed doing, which is the common case on a repair pass
     */
    private Workspace restaff(Workspace workspace) {
        WorkspaceTier tier = settings.tier(workspace.level());
        Optional<Location> anchor = workspace.anchor().toLocation();

        if (anchor.isEmpty()) {
            // The world is not loaded. Nothing can be spawned or removed, and the records are left
            // alone so the next pass — after the world loads — still knows what should be there.
            return workspace;
        }

        boolean suspended = workspace.taxSuspended();
        Workspace current = workspace;

        for (WorkspaceNpcRole role : settings.roles().all()) {
            // Suspension is applied here rather than by a separate teardown, so it is re-applied on
            // every repair pass. It used to be a teardown alone, which meant a restart re-staffed a
            // suspended workspace and handed back for free the one service unpaid tax withholds.
            //
            // A role that opted out of suspension — a decoration — stays: a tax bill should make a
            // business stop trading, not empty somebody's building.
            boolean wanted = tier.staffs(role.id()) && !(suspended && role.suspendable());
            Optional<NpcHandle> existing = current.npc(role.id());

            if (!wanted) {
                if (existing.isPresent()) {
                    npcs.remove(existing.get());
                    current = current.withoutNpc(role.id());
                }
                continue;
            }

            // Already staffed and still alive. Nothing to do — this is the common case on every
            // repair pass, so it must not respawn anything.
            if (existing.isPresent() && npcs.exists(existing.get())) {
                continue;
            }

            Location where = anchor.get().clone().add(role.offsetX(), role.offsetY(), role.offsetZ());

            String definition = safeOverride(workspace.professionId(), role.id()).orElse(role.npcId());

            Optional<NpcHandle> spawned = npcs.spawn(definition, where, current.id());

            if (spawned.isPresent()) {
                current = current.withNpc(role.id(), spawned.get());
            } else if (existing.isPresent()) {
                // The old one is gone and a new one could not be made. Dropping the stale handle
                // means the next repair pass tries again rather than believing it is staffed.
                current = current.withoutNpc(role.id());
            }
        }

        return current;
    }

    /** Asks for a profession's NPC choice, treating a broken resolver as "no opinion". */
    private Optional<String> safeOverride(String professionId, String roleId) {
        try {
            return npcOverride.apply(professionId, roleId);
        } catch (RuntimeException failure) {
            plugin.getLogger().warning("Resolving the NPC for role \"" + roleId + "\" of profession \""
                    + professionId + "\" failed; using the role's own. " + failure.getMessage());
            return Optional.empty();
        }
    }

    /** Removes every NPC belonging to a workspace, keeping the records so they can come back. */
    public void unstaffNpcs(Workspace workspace) {
        workspace.npcs().values().forEach(npcs::remove);

        // Also sweeps any this workspace lost track of — one left by a crash, or by a backend switch.
        npcs.removeAllOwnedBy(workspace.id());
    }

    // ─── Suspension ───────────────────────────────────────────────────────────────────────────

    /**
     * Suspends or restores a workspace's services.
     *
     * Suspension removes the suspendable NPCs and nothing else. Ownership, storage, level and region
     * are all untouched, deliberately: the brief is that unpaid tax should encourage maintenance, not
     * delete months of somebody's work.
     *
     * Both directions go through the same staffing pass rather than a teardown one way and a rebuild
     * the other. One path means suspending and restoring cannot drift apart, and it is also what
     * makes the state survive a restart — see {@link #restaff}.
     */
    public void suspended(Workspace workspace, boolean suspended) {
        if (workspace.taxSuspended() == suspended) {
            return;
        }

        Workspace updated = restaff(workspace.taxSuspended(suspended));

        // One write for the flag and the NPC records together, so a crash between them is not a
        // workspace whose records disagree with the world.
        repository.put(updated);

        notifyExtensions(extension -> extension.onSuspensionChanged(updated, suspended));
    }

    // ─── Releasing ────────────────────────────────────────────────────────────────────────────

    /**
     * Gives up a workspace entirely.
     *
     * Called when the owner resigns from the profession. Extensions are told before anything is
     * removed, which is their only chance to read state that is about to be gone.
     */
    public void release(Workspace workspace) {
        notifyExtensions(extension -> extension.onReleasing(workspace));

        // Releasing discards the storage with it, and there is no undo. Recorded before it goes so
        // an operator answering "I resigned by accident, where did my ore go" has an answer, rather
        // than months of a player's banked output vanishing without trace.
        if (!workspace.storage().isEmpty()) {
            plugin.getLogger().info("Workspace " + workspace.id() + " (" + workspace.professionId()
                    + ", owner " + workspace.owner() + ") was released holding "
                    + workspace.storage().used() + " item(s): " + workspace.storage().describe());
        }

        unstaffNpcs(workspace);
        repository.remove(workspace.id());
    }

    // ─── Storage ──────────────────────────────────────────────────────────────────────────────

    /** How many items this workspace can hold, from its tier. */
    public int capacityOf(Workspace workspace) {
        return settings.tier(workspace.level()).storageSlots();
    }

    /**
     * Whether a material may be stored here.
     *
     * The profession filter is the default and is configurable, because a server that later wants
     * anything stored should be able to say so — but see {@link WorkspaceStorage} for why loosening
     * it has consequences for item metadata.
     */
    public boolean storable(Workspace workspace, Material material, Set<String> professionItems) {
        if (settings.alwaysAllowed(material)) {
            return true;
        }

        return !settings.restrictStorage() || professionItems.contains(material.name());
    }

    /**
     * Commits a storage state worked out by the caller.
     *
     * The batch form, and the one every other storage method here is written in terms of. A "deposit
     * my whole inventory" click touches up to thirty-six stacks; doing that as thirty-six separate
     * commits meant thirty-six persistence round trips — for the file backend, thirty-six full
     * rewrites of the workspace index — for a single click. {@link WorkspaceStorage} is an immutable
     * value, so a caller can apply the whole batch to it in memory and hand the result here once.
     */
    public void storage(Workspace workspace, WorkspaceStorage replacement) {
        if (replacement.equals(workspace.storage())) {
            return;
        }

        repository.put(workspace.withStorage(replacement).touched(System.currentTimeMillis()));
    }

    /**
     * Deposits items.
     *
     * @return how many did not fit, so the caller hands them back rather than deleting them
     */
    public int deposit(Workspace workspace, Material material, int amount) {
        WorkspaceStorage.Deposit result =
                workspace.storage().deposit(material, amount, capacityOf(workspace));

        storage(workspace, result.storage());

        return result.rejected();
    }

    /** Withdraws items. @return how many actually came out */
    public int withdraw(Workspace workspace, Material material, int amount) {
        WorkspaceStorage.Withdrawal result = workspace.storage().withdraw(material, amount);

        storage(workspace, result.storage());

        return result.taken();
    }

    // ─── Extensions ───────────────────────────────────────────────────────────────────────────

    /**
     * Runs something against every extension, containing failures.
     *
     * An extension that throws must not break the operation that notified it — these are called from
     * inside claim and upgrade, which are otherwise atomic.
     */
    private void notifyExtensions(java.util.function.Consumer<WorkspaceExtension> action) {
        for (WorkspaceExtension extension : extensions) {
            try {
                action.accept(extension);
            } catch (RuntimeException failure) {
                plugin.getLogger().log(Level.WARNING, "The workspace extension \""
                        + extension.name() + "\" threw and was ignored.", failure);
            }
        }
    }

    private Optional<String> safeVeto(WorkspaceExtension extension, Workspace workspace, int toLevel) {
        try {
            return extension.vetoUpgrade(workspace, toLevel);
        } catch (RuntimeException failure) {
            plugin.getLogger().log(Level.WARNING, "The workspace extension \"" + extension.name()
                    + "\" threw while vetoing an upgrade; the upgrade was allowed.", failure);
            return Optional.empty();
        }
    }

    /**
     * Tells the extensions that maintenance was collected.
     *
     * Called by {@link WorkspaceTaxService}, which owns the payment but not the extension list.
     * Routed through here rather than giving the tax service its own copy of that list, so there
     * stays exactly one place an extension is registered and one place failures are contained.
     */
    void taxPaid(Workspace workspace, double amount) {
        notifyExtensions(extension -> extension.onTaxPaid(workspace, amount));
    }

    /** Extra description lines contributed by extensions, for the workspace panel. */
    public List<String> describeExtensions(Workspace workspace) {
        List<String> lines = new ArrayList<>();

        for (WorkspaceExtension extension : extensions) {
            try {
                lines.addAll(extension.describe(workspace));
            } catch (RuntimeException failure) {
                plugin.getLogger().fine("The workspace extension \"" + extension.name()
                        + "\" threw while describing: " + failure.getMessage());
            }
        }

        return lines;
    }

    /**
     * Re-staffs every workspace. Run once after the index loads.
     *
     * The repair pass for NPCs lost to a crash, a chunk purge, a manual removal or a backend switch.
     * Cheap because {@link #staffNpcs} does nothing for a workspace whose NPCs are already alive.
     */
    public void repairAll() {
        for (Workspace workspace : repository.all()) {
            try {
                staffNpcs(workspace);
            } catch (RuntimeException failure) {
                plugin.getLogger().warning("Could not restaff workspace " + workspace.id() + ": "
                        + failure.getMessage());
            }
        }
    }
}
