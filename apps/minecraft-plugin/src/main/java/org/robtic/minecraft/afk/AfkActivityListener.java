package org.robtic.minecraft.afk;

import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerChangedWorldEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.entity.Player;

/**
 * Turns player activity into {@link AfkService#touch}.
 *
 * <h2>No logic here</h2>
 *
 * Every handler answers one question — "did this player just do something?" — and hands the answer
 * to the service. Whether that means bringing them back from the lobby, and what saving or
 * restoring involves, is entirely the service's business. That separation is what stops the AFK
 * rules being spread across a dozen event handlers where no one of them can be read as the whole.
 *
 * <h2>Priority</h2>
 *
 * MONITOR with {@code ignoreCancelled}, so an action another plugin refused does not count as
 * activity — a player spamming a command they are not allowed to run is not present at the keyboard
 * in any sense that matters, and more importantly this observes rather than participates.
 */
public final class AfkActivityListener implements Listener {

    private final AfkService afk;

    public AfkActivityListener(AfkService afk) {
        this.afk = afk;
    }

    /**
     * Movement, which is by far the highest-frequency event on a server.
     *
     * Rotation is filtered out unless configured, and it is filtered *here* rather than in the
     * service so the common case costs a couple of double comparisons rather than a map write. A
     * player who has set their mouse down still drifts the view by fractions of a degree, so
     * counting rotation as activity means nobody is ever AFK.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        if (!afk.settings().detectMovement()) {
            return;
        }

        if (!afk.settings().detectRotation()) {
            var from = event.getFrom();
            var to = event.getTo();
            if (from.getX() == to.getX() && from.getY() == to.getY() && from.getZ() == to.getZ()) {
                return;
            }
        }

        afk.touch(event.getPlayer().getUniqueId());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        afk.touch(event.getPlayer().getUniqueId());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        afk.touch(event.getPlayer().getUniqueId());
    }

    /** Covers both using an item and interacting with the world. */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        afk.touch(event.getPlayer().getUniqueId());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInteractEntity(PlayerInteractEntityEvent event) {
        afk.touch(event.getPlayer().getUniqueId());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onAttack(EntityDamageByEntityEvent event) {
        if (event.getDamager() instanceof Player attacker) {
            afk.touch(attacker.getUniqueId());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInventoryOpen(InventoryOpenEvent event) {
        if (afk.settings().detectInventory() && event.getPlayer() instanceof Player player) {
            afk.touch(player.getUniqueId());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInventoryClick(InventoryClickEvent event) {
        if (afk.settings().detectInventory() && event.getWhoClicked() instanceof Player player) {
            afk.touch(player.getUniqueId());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        if (afk.settings().detectCommands()) {
            afk.touch(event.getPlayer().getUniqueId());
        }
    }

    @SuppressWarnings("deprecation")
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        if (afk.settings().detectChat()) {
            afk.touch(event.getPlayer().getUniqueId());
        }
    }

    /**
     * A world change is activity, and it is also the moment a saved location can become wrong.
     *
     * Not treated specially beyond counting as activity: the snapshot names the world it was taken
     * in, so a player who is brought back is brought back to the world they left, whichever one
     * they are standing in now.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onWorldChange(PlayerChangedWorldEvent event) {
        afk.touch(event.getPlayer().getUniqueId());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        afk.track(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        afk.forget(event.getPlayer().getUniqueId(), event.getPlayer().getName());
    }

    /**
     * Death ends AFK without a restore.
     *
     * Respawn has already decided where the player belongs, and dragging them back to where they
     * died — which is what honouring the snapshot would do — is worse than simply forgetting it.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onDeath(PlayerDeathEvent event) {
        afk.abandon(event.getEntity());
    }
}
