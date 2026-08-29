package org.robtic.minecraft.lobby.gui;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Marks an inventory as one of the lobby menus and carries what each slot does.
 *
 * The same holder pattern the exchange and survival menus use, and for the same reason: a title
 * match would be forgeable by renaming a chest, while a holder is created by the plugin and cannot
 * be faked.
 *
 * Carries the subject player where a menu is *about* somebody — the player menu, the give-item
 * confirmation and the inventory preview all need to know whose data they are showing, and putting
 * it on the holder means the click handler does not have to re-resolve it from the title.
 */
public final class LobbyMenuHolder implements InventoryHolder {

    /** Which lobby menu is open, so one listener can serve them all. */
    public enum View {
        /** Right-clicked another player. */
        PLAYER,
        /** Confirming a gift of the held item. */
        GIVE,
        /** Rules, links and support. */
        INFORMATION,
        /** Personal settings. */
        SETTINGS,
        /** Read-only survival inventory. */
        PREVIEW
    }

    /** What clicking a slot means. Kept as an enum so a typo cannot become a silent no-op. */
    public enum Action {
        PROFILE,
        FRIEND_ADD,
        FRIEND_REMOVE,
        FRIEND_ACCEPT,
        FRIEND_DENY,
        FRIEND_TELEPORT,
        GIVE_ITEM,
        GIVE_CONFIRM,
        GIVE_CANCEL,
        CLOSE,
        INFO_ENTRY,
        SETTING_VISIBILITY,
        SETTING_FRIEND_TP,
        SETTING_JOIN_MESSAGE,
        SETTING_PARTICLES,
        SETTING_PRIVATE_PROFILE
    }

    private final View view;
    private final UUID subject;
    private final Map<Integer, Action> actions = new HashMap<>();
    /** Free-form payload for a slot, e.g. which information entry was clicked. */
    private final Map<Integer, String> payloads = new HashMap<>();

    private Inventory inventory;

    public LobbyMenuHolder(View view, UUID subject) {
        this.view = view;
        this.subject = subject;
    }

    public View view() {
        return view;
    }

    /** The player this menu is about, or null for menus about nobody in particular. */
    public UUID subject() {
        return subject;
    }

    public void bind(int slot, Action action) {
        actions.put(slot, action);
    }

    public void bind(int slot, Action action, String payload) {
        actions.put(slot, action);
        payloads.put(slot, payload);
    }

    public Optional<Action> actionAt(int slot) {
        return Optional.ofNullable(actions.get(slot));
    }

    public Optional<String> payloadAt(int slot) {
        return Optional.ofNullable(payloads.get(slot));
    }

    public void attach(Inventory inventory) {
        this.inventory = inventory;
    }

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }
}
