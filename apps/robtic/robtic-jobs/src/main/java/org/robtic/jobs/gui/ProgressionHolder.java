package org.robtic.jobs.gui;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Marks an inventory as one of the progression menus and carries what each slot does.
 *
 * <h2>A holder, not a title match</h2>
 *
 * Identifying a menu by its title lets a player open a renamed chest and have the click handler
 * treat it as the real thing — which, for a menu that equips titles and sells inventories, is an
 * exploit rather than a curiosity. The holder is an object identity the player has no way to forge.
 *
 * <h2>Actions rather than slot arithmetic</h2>
 *
 * Each slot is bound to an {@link Action} when the menu is built, so the click handler switches on
 * intent instead of recomputing which index meant what. Menus here are paginated and filtered, so
 * slot 22 means something different on every view — deriving meaning from the index would be a
 * reliable source of bugs where a filtered list makes a click equip the wrong title.
 */
public final class ProgressionHolder implements InventoryHolder {

    /** Which menu is open. */
    public enum View {
        TITLES,
        JOBS,
        JOB_DETAIL,
        PROFILE,
        SELL,
        FILTER_RARITY,
        FILTER_SOURCE,
        WORKSPACE,
        WORKSPACE_STORAGE,
        /** The base-level ladder — what the business IS. */
        WORKSPACE_UPGRADE,
        /** The workspace-upgrade catalogue — what the business HAS. A different axis entirely. */
        WORKSPACE_UPGRADES,
        /** Hiring, dismissing and reviewing employees. */
        WORKSPACE_WORKERS
    }

    /** What clicking a slot does. */
    public sealed interface Action {

        /** Equip this title. */
        record EquipTitle(String titleId) implements Action {
        }

        /** A title the player cannot equip; clicking explains why rather than doing nothing. */
        record LockedTitle(String titleId) implements Action {
        }

        /** Take off whatever is worn. */
        record Unequip() implements Action {
        }

        /** Open a job's detail page. */
        record OpenJob(String jobId) implements Action {
        }

        /** Make an owned job active. */
        record ActivateJob(String jobId) implements Action {
        }

        /** Stand a job down. */
        record DeactivateJob(String jobId) implements Action {
        }

        /** Leave a job. Confirmation is handled by the menu that binds this. */
        record ResignJob(String jobId) implements Action {
        }

        /** Sell everything the open job buys. */
        record SellAll(String jobId) implements Action {
        }

        /** Move to another page of the current view. */
        record Page(int page) implements Action {
        }

        /** Change the sort order. */
        record Sort(TitleMenuState.Sort sort) implements Action {
        }

        /** Filter to one rarity, or clear it when the id is empty. */
        record FilterRarity(String rarityId) implements Action {
        }

        /** Filter to one source, or clear it when the id is empty. */
        record FilterSource(String sourceId) implements Action {
        }

        /** Prompt for a search term in chat. */
        record Search() implements Action {
        }

        /** Clear every filter and the search term. */
        record ClearFilters() implements Action {
        }

        /** Show or hide titles the player does not own. */
        record ToggleLocked(boolean show) implements Action {
        }

        /** Go back to the menu that opened this one. */
        record Back(View target) implements Action {
        }

        // ─── Workspace ────────────────────────────────────────────────────────────────────────
        //
        // Each carries the workspace id rather than relying on the holder's, so a click is validated
        // against the workspace it names — a menu left open while the workspace is released cannot
        // then act on whatever replaced it.

        /** Open a workspace's panel. */
        record OpenWorkspace(String workspaceId) implements Action {
        }

        /** Open a workspace's storage at a page. */
        record OpenStorage(String workspaceId, int page) implements Action {
        }

        /** Open the upgrade page. */
        record OpenUpgrade(String workspaceId) implements Action {
        }

        /** Buy the next tier. */
        record ConfirmUpgrade(String workspaceId) implements Action {
        }

        /** Pay the outstanding maintenance. */
        record PayTax(String workspaceId) implements Action {
        }

        // ─── The second axis, and the staff ───────────────────────────────────────────────────

        /** Open the workspace-upgrade catalogue. Not the base-level ladder; see the View enum. */
        record OpenUpgrades(String workspaceId) implements Action {
        }

        /** Buy the next level of one workspace upgrade. */
        record BuyUpgrade(String workspaceId, String upgradeId) implements Action {
        }

        /** Open the workforce page. */
        record OpenWorkers(String workspaceId) implements Action {
        }

        /**
         * Take on an NPC worker for a profession.
         *
         * The profession is carried rather than taken from the business, because a business may
         * eventually employ workers of trades other than its own — and a binding that important
         * should be explicit at the point it is decided.
         */
        record HireWorker(String workspaceId, String professionId) implements Action {
        }

        /** Dismiss an employee of either kind. */
        record DismissWorker(String workspaceId, String workerId) implements Action {
        }

        /**
         * Take items out of storage. A plain click takes a stack, shift takes everything.
         *
         * The page is carried so the screen can be redrawn where the player was standing. Without it
         * a withdrawal from page three redrew page one, which for a full storage means hunting back
         * through the pages after every single click.
         */
        record Withdraw(String workspaceId, String material, int page) implements Action {
        }

        /** Put every storable item from the player's inventory in. */
        record DepositAll(String workspaceId, int page) implements Action {
        }

        /** Close. */
        record Close() implements Action {
        }
    }

    private final View view;
    private final Map<Integer, Action> actions = new HashMap<>();

    /** The job this view is about, for the detail and sell menus. */
    private final String jobId;

    private Inventory inventory;

    public ProgressionHolder(View view, String jobId) {
        this.view = view;
        this.jobId = jobId;
    }

    public View view() {
        return view;
    }

    public Optional<String> jobId() {
        return jobId == null || jobId.isBlank() ? Optional.empty() : Optional.of(jobId);
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
