package org.robtic.staff.listener;

import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.robtic.staff.model.StaffItem;
import org.robtic.staff.StaffActionDispatcher;
import org.robtic.staff.StaffModeService;
import org.robtic.staff.StaffToolService;

import java.util.Optional;

/**
 * Turns a click with a staff tool into the action `items.yml` bound to it.
 *
 * The listener knows nothing about what any particular item does — it resolves the held stack to a
 * catalog entry, reads the action id for the click type, and hands it to the dispatcher. Rebinding
 * the blaze rod to something else is therefore a config change and touches no code.
 */
public final class StaffToolListener implements Listener {

    /** How far ahead to look for the player a tool acts on. */
    private static final int TARGET_RANGE = 6;

    private final StaffToolService tools;
    private final StaffActionDispatcher dispatcher;
    private final StaffModeService staffMode;

    public StaffToolListener(StaffToolService tools, StaffActionDispatcher dispatcher, StaffModeService staffMode) {
        this.tools = tools;
        this.dispatcher = dispatcher;
        this.staffMode = staffMode;
    }

    @EventHandler
    public void onInteract(PlayerInteractEvent event) {
        // Only the main hand: an interaction fires once per hand, and without this every action
        // would run twice.
        if (event.getHand() != EquipmentSlot.HAND) {
            return;
        }

        Player staff = event.getPlayer();
        if (!staffMode.isInStaffMode(staff.getUniqueId())) {
            return;
        }

        Optional<StaffItem> resolved = tools.resolve(event.getItem());
        if (resolved.isEmpty()) {
            return;
        }

        StaffItem item = resolved.get();
        event.setCancelled(true);

        String action = switch (event.getAction()) {
            case LEFT_CLICK_AIR, LEFT_CLICK_BLOCK -> item.leftAction();
            case RIGHT_CLICK_AIR, RIGHT_CLICK_BLOCK -> item.rightAction();
            default -> "";
        };

        if (action.isBlank() || !tools.tryUse(staff, item)) {
            return;
        }

        dispatcher.dispatch(action, staff, lookedAtPlayer(staff));
    }

    /** A direct click on a player is the more precise way to name a target than a ray trace. */
    @EventHandler
    public void onInteractEntity(PlayerInteractEntityEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) {
            return;
        }

        Player staff = event.getPlayer();
        if (!staffMode.isInStaffMode(staff.getUniqueId())) {
            return;
        }

        Optional<StaffItem> resolved = tools.resolve(staff.getInventory().getItemInMainHand());
        if (resolved.isEmpty() || !(event.getRightClicked() instanceof Player target)) {
            return;
        }

        StaffItem item = resolved.get();
        event.setCancelled(true);

        if (item.rightAction().isBlank() || !tools.tryUse(staff, item)) {
            return;
        }

        dispatcher.dispatch(item.rightAction(), staff, target);
    }

    /** A staff tool cannot be dropped, so the kit cannot end up in a player's hands. */
    @EventHandler(ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        if (!staffMode.isInStaffMode(event.getPlayer().getUniqueId())) {
            return;
        }

        if (tools.resolve(event.getItemDrop().getItemStack()).isPresent()) {
            event.setCancelled(true);
        }
    }

    /**
     * The player under the crosshair, or null.
     *
     * Uses Bukkit's ray trace rather than an angle comparison so the target matches what the staff
     * member is actually looking at, including through gaps and around corners.
     */
    private Player lookedAtPlayer(Player staff) {
        var result = staff.getWorld().rayTraceEntities(
                staff.getEyeLocation(),
                staff.getEyeLocation().getDirection(),
                TARGET_RANGE,
                entity -> entity instanceof Player && !entity.equals(staff)
        );

        Entity hit = result == null ? null : result.getHitEntity();
        return hit instanceof Player player ? player : null;
    }
}
