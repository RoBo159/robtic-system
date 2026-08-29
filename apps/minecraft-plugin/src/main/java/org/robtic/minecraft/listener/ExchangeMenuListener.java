package org.robtic.minecraft.listener;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.InventoryHolder;
import org.robtic.minecraft.gui.ExchangeController;
import org.robtic.minecraft.gui.ExchangeHolder;
import org.robtic.minecraft.gui.ExchangeMenu;

/**
 * Routes clicks in the exchange menus. Every interaction with an exchange inventory is cancelled
 * before anything else runs, so a player can never remove a display icon or shift-click their own
 * items into the menu — the whole flow stays server-authoritative.
 */
public final class ExchangeMenuListener implements Listener {

    private final ExchangeController controller;
    private final int rows;

    public ExchangeMenuListener(ExchangeController controller, int rows) {
        this.controller = controller;
        this.rows = rows;
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (holderOf(event.getInventory().getHolder()) != null) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        ExchangeHolder holder = holderOf(event.getInventory().getHolder());
        if (holder == null) {
            return;
        }

        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        // Clicks in the player's own inventory while the menu is open are cancelled, not acted on.
        if (event.getClickedInventory() == null || !event.getClickedInventory().equals(event.getInventory())) {
            return;
        }

        if (holder.view() == ExchangeHolder.View.MAIN) {
            handleMainClick(player, holder, event.getSlot());
            return;
        }

        handleItemClick(player, holder, event.getSlot());
    }

    private void handleMainClick(Player player, ExchangeHolder holder, int slot) {
        int bottom = (rows - 1) * 9;

        if (slot == bottom + ExchangeMenu.SELL_ALL_SLOT_OFFSET) {
            controller.sellEverything(player);
            return;
        }

        String itemKey = holder.itemAt(slot);
        if (itemKey != null) {
            controller.openItem(player, itemKey);
        }
    }

    private void handleItemClick(Player player, ExchangeHolder holder, int slot) {
        if (slot == ExchangeMenu.BACK_SLOT) {
            controller.openMain(player);
            return;
        }

        if (slot == ExchangeMenu.CONFIRM_SLOT && holder.focusedItemKey() != null) {
            controller.sellItem(player, holder.focusedItemKey());
        }
    }

    private ExchangeHolder holderOf(InventoryHolder holder) {
        return holder instanceof ExchangeHolder exchangeHolder ? exchangeHolder : null;
    }
}
