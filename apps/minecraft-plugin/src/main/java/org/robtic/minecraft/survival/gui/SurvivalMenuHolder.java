package org.robtic.minecraft.survival.gui;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Marks an inventory as one of the survival menus and carries what each slot means.
 *
 * A holder rather than a title match, for the same reason the exchange menu uses one: a player can
 * rename a chest to anything, so matching on the title would let them forge a menu and fire its
 * click handler. The holder is created by the plugin and cannot be faked.
 *
 * @param <T> the payload a slot maps to — a home name, a friend's UUID, a particle
 */
public final class SurvivalMenuHolder<T> implements InventoryHolder {

    /** Which menu is open, so one listener can serve them all. */
    public enum View {
        HOMES,
        FRIENDS,
        FRIEND_REQUESTS,
        FRIEND_SETTINGS,
        PARTICLES,
        PROFILE
    }

    private final View view;
    private final Map<Integer, T> slots = new HashMap<>();
    private Inventory inventory;

    public SurvivalMenuHolder(View view) {
        this.view = view;
    }

    public View view() {
        return view;
    }

    public void bind(int slot, T payload) {
        slots.put(slot, payload);
    }

    public Optional<T> at(int slot) {
        return Optional.ofNullable(slots.get(slot));
    }

    public void attach(Inventory inventory) {
        this.inventory = inventory;
    }

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }
}
