package org.robtic.minecraft.license.gui;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Marks an inventory as the licence browser and carries what each slot does.
 *
 * <h2>A holder, not a title match</h2>
 *
 * Identifying a menu by its title lets a player rename a chest and have the click handler treat it
 * as the real thing — which, for a menu that spends robs, is an exploit rather than a curiosity. The
 * holder is an object identity a player has no way to forge.
 *
 * <h2>Actions rather than slot arithmetic</h2>
 *
 * Each slot is bound to an {@link Action} when the menu is built, so the click handler switches on
 * intent instead of recomputing which index meant what. The browser is paged and filtered by
 * category, so slot 22 means something different on every view — deriving meaning from the index
 * would be a reliable source of bugs where a filtered list renews the wrong licence.
 */
public final class LicenseBrowserHolder implements InventoryHolder {

    /** What clicking a slot does. */
    public sealed interface Action {

        /** Show this licence's detail, or renew it if it is already open. */
        record Inspect(String licenseId) implements Action {
        }

        /** Attempt a renewal. Only bound for a licence the player actually holds. */
        record Renew(String licenseId) implements Action {
        }

        /** Filter to one category, or clear the filter when the id is empty. */
        record Filter(String categoryId) implements Action {
        }

        /** Move to another page. */
        record Page(int page) implements Action {
        }

        /** Close the menu. */
        record Close() implements Action {
        }
    }

    private final Map<Integer, Action> actions = new HashMap<>();

    /** The category currently filtered to, so a redraw after a renewal keeps the player's place. */
    private final String categoryId;

    private final int page;

    private Inventory inventory;

    public LicenseBrowserHolder(String categoryId, int page) {
        this.categoryId = categoryId;
        this.page = page;
    }

    public String categoryId() {
        return categoryId;
    }

    public int page() {
        return page;
    }

    public void bind(int slot, Action action) {
        actions.put(slot, action);
    }

    /** What this slot does, or empty for decoration. */
    public Optional<Action> actionAt(int slot) {
        return Optional.ofNullable(actions.get(slot));
    }

    public void attach(Inventory inventory) {
        this.inventory = inventory;
    }

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }
}
