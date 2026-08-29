package org.robtic.minecraft.gui;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Identifies an inventory as one of the staff menus and carries what each slot means.
 *
 * Using a holder rather than matching on the inventory title is what makes the click handler safe:
 * a player can rename a chest to "Player Management" but cannot forge a holder, so there is no way
 * to get the plugin to run a staff action from an inventory the plugin did not open.
 */
public final class StaffMenuHolder implements InventoryHolder {

    /** Which menu this is; the click router dispatches on it. */
    public enum View {
        PLAYER_LIST,
        PLAYER_MANAGE,
        TELEPORT,
        LOBBY,
        INSPECT_INVENTORY,
        INSPECT_ENDERCHEST,
        DASHBOARD,
        HISTORY,
        /** The open report queue. */
        REPORTS,
        /** One report, with everything about it and the accept and refuse buttons. */
        REPORT_DETAIL
    }

    private final View view;
    /** The player this menu is about, for the views that concern one. */
    private final UUID subject;
    private final String subjectName;

    /** Slot → the player that slot represents. */
    private final Map<Integer, UUID> slotPlayers = new HashMap<>();
    /** Slot → an action id, for the button views. */
    private final Map<Integer, String> slotActions = new HashMap<>();
    /** Slot → a lobby id. */
    private final Map<Integer, String> slotLobbies = new HashMap<>();
    /** Slot → a report code, for the report queue. */
    private final Map<Integer, String> slotReports = new HashMap<>();

    /**
     * The report a detail view is about.
     *
     * Held on the holder rather than re-read from the clicked item, so a staff member cannot end up
     * accepting a different report by clicking as the menu refreshes underneath them.
     */
    private String reportCode;

    private Inventory inventory;

    public StaffMenuHolder(View view, UUID subject, String subjectName) {
        this.view = view;
        this.subject = subject;
        this.subjectName = subjectName;
    }

    public View view() {
        return view;
    }

    public UUID subject() {
        return subject;
    }

    public String subjectName() {
        return subjectName;
    }

    public void bindPlayer(int slot, UUID uuid) {
        slotPlayers.put(slot, uuid);
    }

    public UUID playerAt(int slot) {
        return slotPlayers.get(slot);
    }

    public void bindAction(int slot, String actionId) {
        slotActions.put(slot, actionId);
    }

    public String actionAt(int slot) {
        return slotActions.get(slot);
    }

    public void bindLobby(int slot, String lobbyId) {
        slotLobbies.put(slot, lobbyId);
    }

    public String lobbyAt(int slot) {
        return slotLobbies.get(slot);
    }

    public void bindReport(int slot, String code) {
        slotReports.put(slot, code);
    }

    public String reportAt(int slot) {
        return slotReports.get(slot);
    }

    public void reportCode(String code) {
        this.reportCode = code;
    }

    /** The report a detail view is about, or null in every other view. */
    public String reportCode() {
        return reportCode;
    }

    public void attach(Inventory inventory) {
        this.inventory = inventory;
    }

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }
}
