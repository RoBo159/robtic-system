package org.robtic.world.gui;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

import java.util.HashMap;
import java.util.Map;

/**
 * Identity and state for the marker menu.
 *
 * <h2>Why a holder and not a title match</h2>
 *
 * Matching on the window title is the usual shortcut and it is wrong in two directions: a player can
 * open a renamed shulker box called "Structure Markers" and have their clicks interpreted as menu
 * clicks, and a server that translates the title breaks the menu. An inventory holder is the
 * identity Bukkit itself provides, cannot be forged from inside the game, and carries the page and
 * category with it so the listener does not need a map keyed on player.
 */
public final class MarkerMenuHolder implements InventoryHolder {

    private final String categoryId;
    private final int page;

    /** Which marker type each slot offers, so a click resolves without re-deriving the layout. */
    private final Map<Integer, String> slots = new HashMap<>();

    /** Which category each tab slot selects. */
    private final Map<Integer, String> tabs = new HashMap<>();

    private Inventory inventory;

    public MarkerMenuHolder(String categoryId, int page) {
        this.categoryId = categoryId;
        this.page = page;
    }

    public String categoryId() {
        return categoryId;
    }

    public int page() {
        return page;
    }

    public void offer(int slot, String typeId) {
        slots.put(slot, typeId);
    }

    public void tab(int slot, String tabCategoryId) {
        tabs.put(slot, tabCategoryId);
    }

    /** The marker type a slot hands out, or null when the slot is decoration. */
    public String typeAt(int slot) {
        return slots.get(slot);
    }

    /** The category a slot switches to, or null when it is not a tab. */
    public String tabAt(int slot) {
        return tabs.get(slot);
    }

    public void inventory(Inventory inventory) {
        this.inventory = inventory;
    }

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }
}
