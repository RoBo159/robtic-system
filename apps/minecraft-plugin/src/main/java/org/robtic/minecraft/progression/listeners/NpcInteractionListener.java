package org.robtic.minecraft.progression.listeners;

import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.progression.events.PlayerGainJobEvent;
import org.robtic.minecraft.progression.jobs.Job;
import org.robtic.minecraft.progression.jobs.JobService;
import org.robtic.minecraft.progression.npc.NpcDefinition;
import org.robtic.minecraft.progression.npc.NpcHandle;
import org.robtic.minecraft.progression.npc.NpcService;
import org.robtic.minecraft.progression.workspace.DiscoveryService;
import org.robtic.minecraft.progression.workspace.StructureMarker;
import org.robtic.minecraft.progression.workspace.Workspace;
import org.robtic.minecraft.progression.workspace.WorkspaceNpcRole;
import org.robtic.minecraft.progression.workspace.WorkspaceService;

import java.util.Optional;

/**
 * Routes a click on one of this plugin's NPCs to whatever that NPC is for.
 *
 * <h2>Not a Bukkit listener</h2>
 *
 * It registers with {@link NpcService#onInteract}, which every backend delivers through. That is not
 * a stylistic preference: FancyNPCs NPCs are packets with no entity, so a
 * {@code PlayerInteractEntityEvent} handler would silently never fire for them. Normalising the
 * click at the provider means this class is written once and works on all three backends.
 *
 * <h2>Two kinds of NPC, and neither is special-cased by name</h2>
 *
 * A recruiter offers a job; anything else belongs to a workspace and is dispatched by its role
 * through a registered handler. A future contract or event NPC therefore needs no change here — it
 * registers a role handler and its clicks arrive.
 */
public final class NpcInteractionListener {

    private final Plugin plugin;
    private final NpcService npcs;
    private final JobService jobs;
    private final WorkspaceService workspaces;
    private final DiscoveryService discovery;
    private final MessageCatalog messages;

    public NpcInteractionListener(
            Plugin plugin,
            NpcService npcs,
            JobService jobs,
            WorkspaceService workspaces,
            DiscoveryService discovery,
            MessageCatalog messages
    ) {
        this.plugin = plugin;
        this.npcs = npcs;
        this.jobs = jobs;
        this.workspaces = workspaces;
        this.discovery = discovery;
        this.messages = messages;
    }

    /** Registers with every NPC backend. Called once at enable. */
    public void register() {
        npcs.onInteract(this::onClick);
    }

    private void onClick(Player player, NpcHandle handle) {
        Optional<NpcDefinition> definition = npcs.definitionOf(handle);

        if (definition.isEmpty()) {
            // Tagged as ours but its definition is gone from the config. Left standing rather than
            // removed: an operator who mistyped an id should be able to fix the file and reload, not
            // find their guild halls emptied.
            return;
        }

        switch (definition.get().kind()) {
            case RECRUITER -> recruit(player, handle);
            case SELLER -> workspaceNpc(player, handle);
            case DECORATION -> {
                // Exists to populate a building. Deliberately does nothing.
            }
        }
    }

    // ─── Recruitment ──────────────────────────────────────────────────────────────────────────

    /**
     * Offers the job a recruiter represents, and claims the structure on success.
     *
     * The job is granted first and the workspace second. That order is deliberate: a job with no
     * workspace is a coherent state — jobs granted by command never have one — whereas a workspace
     * for a job the player does not hold is not.
     */
    private void recruit(Player player, NpcHandle handle) {
        Optional<StructureMarker> marker = discovery.markerOf(handle);

        if (marker.isEmpty()) {
            // Neither this session's index nor the NPC's own tags could say what building this is or
            // what it offers — a leftover from an older install, or an NPC whose definition no longer
            // names a job. Removed rather than left offering a job that cannot be completed.
            npcs.remove(handle);
            discovery.forgetRecruiter(handle);
            player.sendMessage(messages.prefixed("progression.jobs.recruiter-stale"));
            return;
        }

        Optional<Job> job = jobs.catalog().job(marker.get().jobId());

        if (job.isEmpty()) {
            player.sendMessage(messages.prefixed("progression.jobs.unknown",
                    "job", marker.get().jobId()));
            return;
        }

        JobService.ClaimResult result =
                jobs.claim(player, job.get().id(), PlayerGainJobEvent.Source.RECRUITMENT_NPC);

        if (result != JobService.ClaimResult.SUCCESS) {
            player.sendMessage(messages.prefixed(refusalKey(result),
                    "job", job.get().display(),
                    "limit", String.valueOf(jobs.limits().forPlayer(player.getUniqueId()).owned())));
            return;
        }

        player.sendMessage(messages.prefixed("progression.jobs.joined", "job", job.get().display()));
        player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.2f);

        claimWorkspace(player, job.get(), marker.get());
    }

    /**
     * Turns the discovered structure into the player's workspace.
     *
     * Failure here is reported but does not undo the job — see {@link #recruit}. Every recruiter at
     * the structure is cleared only once the claim has actually committed, so a refused claim leaves
     * the building available rather than emptied.
     */
    private void claimWorkspace(Player player, Job job, StructureMarker marker) {
        if (!job.workspace().enabled()) {
            // The job exists but converts nothing. The recruiter still goes: it has done its job, and
            // leaving it would let a second player claim the same building.
            discovery.clearRecruitersAt(marker.structureId());
            return;
        }

        WorkspaceService.ClaimResult result = workspaces.claim(
                player,
                job.id(),
                marker.structureId(),
                marker.anchor(),
                job.workspace().protectionRadius(),
                claimed -> {
                    if (claimed.isEmpty()) {
                        player.sendMessage(messages.prefixed("progression.workspace.claim-failed"));
                        return;
                    }

                    // Every recruiter here goes, not only the one clicked — which is what makes a
                    // multi-profession guild hall collapse to the single job the player chose.
                    discovery.clearRecruitersAt(marker.structureId());

                    player.sendMessage(messages.prefixed("progression.workspace.claimed",
                            "where", claimed.get().region().describe()));
                });

        if (result != WorkspaceService.ClaimResult.SUCCESS) {
            player.sendMessage(messages.prefixed(claimRefusalKey(result),
                    "limit", String.valueOf(workspaces.limitFor(player.getUniqueId()))));
        }
    }

    // ─── Workspace NPCs ───────────────────────────────────────────────────────────────────────

    /**
     * Dispatches a click on a workspace NPC to the handler registered for its role.
     *
     * <h2>The role comes from the workspace, not from the NPC's kind</h2>
     *
     * The workspace records which role each of its NPCs fills, so that record is what decides where a
     * click goes. Deriving the role from {@link NpcDefinition.Kind} instead — as this did — collapses
     * every workspace NPC onto {@code seller} regardless of the job it was spawned for, because
     * {@code Kind} is a closed enum with no case for the roles that are configured. The upgrade NPC
     * only worked at all because it was declared as a seller in {@code npc.yml} and both roles happen
     * to be handled the same way today; a contract or event NPC, which is the whole reason roles are
     * a registry, would have gone to the wrong handler.
     *
     * Ownership is checked against the workspace the NPC belongs to rather than against the player's
     * job list: a player can own the Miner job and still be standing in somebody else's mine.
     */
    private void workspaceNpc(Player player, NpcHandle handle) {
        Optional<String> owner = npcs.ownerOf(handle);

        if (owner.isEmpty()) {
            return;
        }

        Optional<Workspace> found = workspaces.byId(owner.get());

        if (found.isEmpty()) {
            // The workspace is gone but its NPC is not — a release that failed partway, or a stale
            // NPC from a previous install. Removed, so it stops offering a service nothing backs.
            npcs.remove(handle);
            return;
        }

        Workspace workspace = found.get();

        if (!workspace.ownedBy(player.getUniqueId())
                && !player.hasPermission(WorkspaceService.BYPASS)) {
            player.sendMessage(messages.prefixed("progression.workspace.not-yours"));
            return;
        }

        String role = workspace.roleOf(handle).orElse(WorkspaceNpcRole.SELLER);
        Optional<WorkspaceNpcRole.Handler> handler = workspaces.handler(role);

        if (handler.isEmpty()) {
            // A role with no handler registered. Says so once rather than appearing broken to the
            // player, because this is a wiring mistake rather than anything they did.
            plugin.getLogger().warning("No handler is registered for the workspace NPC role \""
                    + role + "\", so clicking it does nothing.");
            return;
        }

        handler.get().handle(player, workspace);
    }

    // ─── Messages ─────────────────────────────────────────────────────────────────────────────

    private static String refusalKey(JobService.ClaimResult result) {
        return switch (result) {
            case ALREADY_OWNED -> "progression.jobs.already-owned";
            case OWNED_LIMIT_REACHED -> "progression.jobs.limit-reached";
            case NO_PERMISSION -> "progression.jobs.no-permission";
            case NOT_LOADED -> "progression.not-loaded";
            case IN_PROGRESS -> "progression.jobs.in-progress";
            case UNKNOWN_JOB -> "progression.jobs.unknown";
            case CANCELLED -> "progression.jobs.cancelled";
            case SUCCESS -> "progression.jobs.joined";
        };
    }

    private static String claimRefusalKey(WorkspaceService.ClaimResult result) {
        return switch (result) {
            case DISABLED -> "progression.workspace.disabled";
            case NOT_READY -> "progression.workspace.not-ready";
            case STRUCTURE_TAKEN -> "progression.workspace.structure-taken";
            case ALREADY_OWNS_FOR_PROFESSION -> "progression.workspace.already-owns";
            case LIMIT_REACHED -> "progression.workspace.limit-reached";
            case REGION_OVERLAPS -> "progression.workspace.overlaps";
            case REGION_TOO_LARGE -> "progression.workspace.too-large";
            case WORLD_UNLOADED -> "progression.workspace.world-unloaded";
            case SAVE_FAILED, SUCCESS -> "progression.workspace.claim-failed";
        };
    }
}
