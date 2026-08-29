package org.robtic.minecraft.progression.events;

import org.bukkit.event.Cancellable;
import org.bukkit.event.HandlerList;
import org.robtic.minecraft.progression.jobs.Job;
import org.robtic.minecraft.progression.workspace.Workspace;

import java.util.UUID;

/**
 * A structure is about to become a player's workspace.
 *
 * Fired after the job has been granted and before the workspace is registered, which is the only
 * order that lets a land-protection plugin have a say: it can veto on the grounds of where the
 * building is, without also undoing a job the player has already been told they have.
 *
 * Cancelling leaves the player with the job and no workspace. That is a coherent state — a job's
 * workspace is optional configuration, and jobs granted by command never have one — so the veto
 * needs to unwind nothing.
 *
 * @see org.robtic.minecraft.progression.workspace.WorkspaceExtension for the richer seam future
 *      systems should use; this event is for other plugins, that interface is for Robtic's own
 */
public final class WorkspaceClaimEvent extends ProgressionPlayerEvent implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Workspace workspace;
    private final Job job;
    private boolean cancelled;

    public WorkspaceClaimEvent(UUID playerId, Workspace workspace, Job job) {
        super(playerId);
        this.workspace = workspace;
        this.job = job;
    }

    /** The workspace as it will be registered, including its region and tier. */
    public Workspace getWorkspace() {
        return workspace;
    }

    public Job getJob() {
        return job;
    }

    @Override
    public boolean isCancelled() {
        return cancelled;
    }

    @Override
    public void setCancelled(boolean cancel) {
        this.cancelled = cancel;
    }

    @Override
    public HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
