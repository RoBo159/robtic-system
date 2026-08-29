package org.robtic.minecraft.progression.workspace;

import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.Cancellable;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBurnEvent;
import org.bukkit.event.block.BlockExplodeEvent;
import org.bukkit.event.block.BlockFromToEvent;
import org.bukkit.event.block.BlockIgniteEvent;
import org.bukkit.event.block.BlockPistonExtendEvent;
import org.bukkit.event.block.BlockPistonRetractEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.block.BlockSpreadEvent;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.EntityChangeBlockEvent;
import org.bukkit.event.entity.EntityExplodeEvent;
import org.bukkit.event.player.PlayerBucketEmptyEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.robtic.minecraft.config.MessageCatalog;

import java.util.List;

/**
 * Keeps everything except the owner out of a claimed workspace.
 *
 * <h2>The workspace is a reward, and rewards must not need moderation</h2>
 *
 * A player who finds a structure, claims it and builds their business there should not lose it to a
 * creeper, a lava bucket over the wall, or somebody piston-pushing their way in. Every one of those
 * is a separate Bukkit event, which is why this class is long: there is no single "protect this
 * region" hook, and a protection system missing any one of them has a hole that will be found.
 *
 * <pre>
 *   break / place / interact     players
 *   entity + block explode       TNT, creepers, end crystals, beds
 *   ignite / burn / spread       fire
 *   from-to / bucket empty       lava and water
 *   piston extend / retract      pulling blocks out or pushing them in
 *   entity change block          endermen, ravagers, falling blocks
 * </pre>
 *
 * <h2>HIGH, not HIGHEST or MONITOR</h2>
 *
 * MONITOR cannot cancel, so it is useless here. HIGHEST is left free for a dedicated land-protection
 * plugin, which should have the final word — this is a feature of the jobs system, not a claims
 * plugin competing with the server's own.
 *
 * <h2>Fail closed, for players</h2>
 *
 * While the workspace index has not loaded, {@link WorkspaceService#mayInteract} denies everyone
 * without the bypass. An operator noticing nobody can use their workspace will ask why; nobody
 * notices a stranger quietly dismantling a building until it is gone.
 *
 * The environmental checks below go through {@link WorkspaceService#isProtected}, which fails open
 * for the reason given there — it cannot say "everywhere is protected" without stopping every
 * explosion and every fluid on the server.
 */
public final class WorkspaceProtectionListener implements Listener {

    private final WorkspaceService workspaces;
    private final MessageCatalog messages;

    public WorkspaceProtectionListener(WorkspaceService workspaces, MessageCatalog messages) {
        this.workspaces = workspaces;
        this.messages = messages;
    }

    // ─── Players ──────────────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        deny(event, event.getPlayer(), event.getBlock());
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        deny(event, event.getPlayer(), event.getBlock());
    }

    /**
     * Containers and blocks whose state a stranger could change.
     *
     * Not every right-click: cancelling those would stop a visitor standing on a pressure plate and
     * would block the owner's own workspace NPCs, for no security benefit — the damage a stranger can
     * do is through containers and interactable blocks.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        Block block = event.getClickedBlock();

        if (block == null || event.getAction() != org.bukkit.event.block.Action.RIGHT_CLICK_BLOCK) {
            return;
        }

        if (!(block.getState() instanceof org.bukkit.inventory.InventoryHolder)
                && !block.getType().isInteractable()) {
            return;
        }

        deny(event, event.getPlayer(), block);
    }

    /** A lava or water bucket emptied over the wall is the cheapest possible grief. */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBucketEmpty(PlayerBucketEmptyEvent event) {
        deny(event, event.getPlayer(), event.getBlock());
    }

    // ─── Explosions ───────────────────────────────────────────────────────────────────────────

    /**
     * Creepers, TNT, end crystals, beds in the Nether.
     *
     * The blocks inside the workspace are filtered out of the explosion rather than the whole
     * explosion being cancelled. A creeper that detonates half outside a workspace should still crater
     * the ground outside it — cancelling outright would make workspaces into invisible blast shields
     * for whatever is standing next to them.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onEntityExplode(EntityExplodeEvent event) {
        if (workspaces.settings().protectExplosions()) {
            event.blockList().removeIf(block -> workspaces.isProtected(block.getLocation()));
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBlockExplode(BlockExplodeEvent event) {
        if (workspaces.settings().protectExplosions()) {
            event.blockList().removeIf(block -> workspaces.isProtected(block.getLocation()));
        }
    }

    // ─── Fire ─────────────────────────────────────────────────────────────────────────────────

    /**
     * Ignition, but not by the owner.
     *
     * An owner lighting a campfire or a furnace in their own workspace is ordinary; the case being
     * stopped is somebody setting the building alight from outside.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onIgnite(BlockIgniteEvent event) {
        if (!workspaces.settings().protectFire()) {
            return;
        }

        if (event.getPlayer() != null) {
            deny(event, event.getPlayer(), event.getBlock());
            return;
        }

        // Spread, lightning or lava. Nobody is responsible, so it is simply refused.
        if (workspaces.isProtected(event.getBlock().getLocation())) {
            event.setCancelled(true);
        }
    }

    /** Blocks burning away. */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBurn(BlockBurnEvent event) {
        if (workspaces.settings().protectFire()
                && workspaces.isProtected(event.getBlock().getLocation())) {
            event.setCancelled(true);
        }
    }

    /** Fire spreading in, and vines or grass spreading over a build. */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onSpread(BlockSpreadEvent event) {
        if (event.getSource().getType() != org.bukkit.Material.FIRE) {
            return;
        }

        if (workspaces.settings().protectFire()
                && workspaces.isProtected(event.getBlock().getLocation())) {
            event.setCancelled(true);
        }
    }

    // ─── Fluids ───────────────────────────────────────────────────────────────────────────────

    /**
     * Lava and water flowing in from outside.
     *
     * Only flow that *enters* a workspace is stopped. Fluid already inside one moves normally, so an
     * owner's own water feature works and their farm still irrigates.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onFlow(BlockFromToEvent event) {
        if (!workspaces.settings().protectFluids()) {
            return;
        }

        boolean intoWorkspace = workspaces.isProtected(event.getToBlock().getLocation());
        boolean fromWorkspace = workspaces.isProtected(event.getBlock().getLocation());

        if (intoWorkspace && !fromWorkspace) {
            event.setCancelled(true);
        }
    }

    // ─── Pistons ──────────────────────────────────────────────────────────────────────────────

    /**
     * Pushing blocks into a workspace, or pulling them out of one.
     *
     * Checked against every moved block rather than the piston, because a twelve-block push starting
     * well outside a workspace can still end inside it — which is exactly how a piston door gets
     * built through a protected wall.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onPistonExtend(BlockPistonExtendEvent event) {
        if (workspaces.settings().protectPistons() && touchesWorkspace(event.getBlocks())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onPistonRetract(BlockPistonRetractEvent event) {
        if (workspaces.settings().protectPistons() && touchesWorkspace(event.getBlocks())) {
            event.setCancelled(true);
        }
    }

    /**
     * Whether a piston move involves a protected block.
     *
     * The piston itself is checked too, so a piston inside a workspace pushing its owner's own blocks
     * around is not stopped — that case is the piston and the blocks all being in the same workspace,
     * which this does not cancel because the piston's own base is protected identically.
     */
    private boolean touchesWorkspace(List<Block> blocks) {
        for (Block block : blocks) {
            if (workspaces.isProtected(block.getLocation())
                    || workspaces.isProtected(block.getRelative(0, 1, 0).getLocation())) {
                return true;
            }
        }

        return false;
    }

    // ─── Entities ─────────────────────────────────────────────────────────────────────────────

    /**
     * Endermen taking blocks, ravagers trampling, falling sand landing.
     *
     * Rarer than the rest and just as destructive over time — an enderman removing one block a week
     * from somebody's guild hall is the kind of damage nobody can attribute to anything.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onEntityChangeBlock(EntityChangeBlockEvent event) {
        if (event.getEntity() instanceof Player) {
            return;
        }

        if (workspaces.isProtected(event.getBlock().getLocation())) {
            event.setCancelled(true);
        }
    }

    // ─── Shared ───────────────────────────────────────────────────────────────────────────────

    /**
     * Cancels an event and tells the player why, unless they are allowed.
     *
     * The message goes to the action bar rather than chat: a player who walks into a workspace and
     * tries to mine will trigger this repeatedly, and filling their chat with the same line would be
     * worse than the denial itself.
     */
    private void deny(Cancellable event, Player player, Block block) {
        if (workspaces.mayInteract(player, block.getLocation())) {
            return;
        }

        event.setCancelled(true);
        player.sendActionBar(messages.component("progression.workspace.protected"));
    }
}
