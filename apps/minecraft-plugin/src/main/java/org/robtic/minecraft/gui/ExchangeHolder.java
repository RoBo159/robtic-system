package org.robtic.minecraft.gui;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

import java.util.HashMap;
import java.util.Map;

/**
 * Marks an inventory as belonging to the exchange and carries the slot → item-key mapping. Using
 * a holder rather than matching on the inventory title is what makes the click handler safe: a
 * player cannot fake it by renaming a chest.
 */
public final class ExchangeHolder implements InventoryHolder {

    /** Which menu the open inventory is. */
    public enum View {
        MAIN,
        ITEM
    }

    private final View view;
    private final Map<Integer, String> slotItems = new HashMap<>();
    /** Item being sold in an ITEM view; null in the MAIN view. */
    private final String focusedItemKey;

    private Inventory inventory;

    public ExchangeHolder(View view, String focusedItemKey) {
        this.view = view;
        this.focusedItemKey = focusedItemKey;
    }

    public View view() {
        return view;
    }

    public String focusedItemKey() {
        return focusedItemKey;
    }

    public void bindSlot(int slot, String itemKey) {
        slotItems.put(slot, itemKey);
    }

    public String itemAt(int slot) {
        return slotItems.get(slot);
    }

    public void attach(Inventory inventory) {
        this.inventory = inventory;
    }

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }
}
