package org.robtic.minecraft.listener;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerTeleportEvent;
import org.bukkit.event.vehicle.VehicleEnterEvent;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.config.StaffSettings;
import org.robtic.minecraft.staff.FreezeService;
import org.robtic.minecraft.staff.JailService;

import java.util.UUID;

/**
 * Enforces what a frozen or jailed player may not do.
 *
 * Both states share this listener because they restrict almost the same set of actions and differ
 * only in the command whitelist and in whether movement is blocked outright or merely bounded.
 * Keeping them together means a newly restricted action cannot be added to one and forgotten in
 * the other.
 *
 * Commands are checked against a **whitelist**. A deny-list would be one unknown `/tpa` alias away
 * from letting someone walk out of a jail, and plugins add aliases constantly.
 */
public final class RestrictionListener implements Listener {

    private final FreezeService freeze;
    private final JailService jail;
    private final StaffSettings settings;
    private final MessageCatalog messages;

    public RestrictionListener(FreezeService freeze, JailService jail, StaffSettings settings, MessageCatalog messages) {
        this.freeze = freeze;
        this.jail = jail;
        this.settings = settings;
        this.messages = messages;
    }

    /**
     * Blocks movement while frozen.
     *
     * Only a change of block is rejected, not a change of angle — a frozen player must still be
     * able to look around, both so the freeze does not feel like a crash and so they can read the
     * title telling them what happened.
     */
    @EventHandler(ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        if (!freeze.isFrozen(event.getPlayer().getUniqueId())) {
            return;
        }

        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
                && event.getFrom().getBlockY() == event.getTo().getBlockY()
                && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) {
            return;
        }

        event.setCancelled(true);
    }

    /**
     * Stops a frozen player being teleported away by another plugin.
     *
     * A plugin teleport is exempt only when it is the freeze itself; everything else — a home
     * warp, a spawn command run by someone else — is rejected, since otherwise a frozen player
     * has an obvious escape.
     */
    @EventHandler(ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        if (!freeze.isFrozen(event.getPlayer().getUniqueId())) {
            return;
        }

        if (event.getCause() == PlayerTeleportEvent.TeleportCause.PLUGIN) {
            return;
        }

        event.setCancelled(true);
    }

    /** Enforces both command whitelists. Runs at LOWEST so nothing else acts on it first. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        String message = event.getMessage();

        if (freeze.isFrozen(uuid) && !settings.isFreezeCommandAllowed(message)) {
            event.setCancelled(true);
            event.getPlayer().sendMessage(messages.prefixed("freeze.command-blocked"));
            return;
        }

        if (jail.isJailed(uuid) && !settings.isJailCommandAllowed(message)) {
            event.setCancelled(true);
            event.getPlayer().sendMessage(messages.prefixed("jail.command-blocked"));
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        if (!settings.freezeBlockDrop()) {
            return;
        }
        if (isRestricted(event.getPlayer())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        if (!settings.freezeBlockInteract()) {
            return;
        }
        if (isRestricted(event.getPlayer())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onVehicle(VehicleEnterEvent event) {
        if (!settings.freezeBlockVehicles()) {
            return;
        }
        if (event.getEntered() instanceof Player player && isRestricted(player)) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        if (isRestricted(event.getPlayer())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        if (isRestricted(event.getPlayer())) {
            event.setCancelled(true);
        }
    }

    /** A restricted player can neither deal damage nor be hit, so a freeze is not a death sentence. */
    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageByEntityEvent event) {
        if (event.getDamager() instanceof Player attacker && isRestricted(attacker)) {
            event.setCancelled(true);
            return;
        }

        if (event.getEntity() instanceof Player victim && freeze.isFrozen(victim.getUniqueId())) {
            event.setCancelled(true);
        }
    }

    private boolean isRestricted(Player player) {
        UUID uuid = player.getUniqueId();
        return freeze.isFrozen(uuid) || jail.isJailed(uuid);
    }
}
