package org.robtic.minecraft.lobby;

import org.bukkit.NamespacedKey;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.gui.Icons;

import java.util.Optional;

/**
 * Builds, gives and identifies the lobby hotbar items.
 *
 * <h2>Identified by persistent data, not by name or material</h2>
 *
 * Each item carries a namespaced key in its {@link org.bukkit.persistence.PersistentDataContainer}.
 * Matching on display name or material would be trivially forgeable — a player could rename any
 * book to the information item's name and get its click handler — and would also break the moment
 * an operator translated the names in config.
 *
 * The tag also makes "is this a lobby item?" answerable for an arbitrary stack, which is what the
 * restriction listener needs to stop them being moved, dropped or stored.
 */
public final class LobbyItems {

    private final Plugin plugin;
    private final LobbyConfiguration config;

    /** Marks a stack as a lobby item and records which one it is. */
    private final NamespacedKey key;

    public LobbyItems(Plugin plugin, LobbyConfiguration config) {
        this.plugin = plugin;
        this.config = config;
        this.key = new NamespacedKey(plugin, "lobby_item");
    }

    /**
     * Clears the hotbar and gives the configured lobby items.
     *
     * The inventory is cleared rather than merged into: Multiverse-Inventories has already swapped
     * in the lobby inventory by this point, so whatever is there is lobby state — and leaving
     * anything behind is how duplicate or stale items accumulate across sessions.
     *
     * Main thread only.
     */
    public void give(Player player) {
        player.getInventory().clear();

        for (LobbyConfiguration.LobbyItem item : config.items().values()) {
            player.getInventory().setItem(item.slot(), build(item));
        }

        player.updateInventory();
    }

    /**
     * Removes every lobby item.
     *
     * Called when leaving the lobby. Only tagged stacks are touched — Multiverse-Inventories is
     * what restores the survival inventory, and clearing the whole inventory here would race it.
     *
     * Main thread only.
     */
    public void remove(Player player) {
        ItemStack[] contents = player.getInventory().getContents();

        for (int slot = 0; slot < contents.length; slot++) {
            if (isLobbyItem(contents[slot])) {
                player.getInventory().setItem(slot, null);
            }
        }

        player.updateInventory();
    }

    /** True when the stack is one of ours, whatever it has been renamed to. */
    public boolean isLobbyItem(ItemStack stack) {
        return identify(stack).isPresent();
    }

    /** The configured item this stack represents, if any. */
    public Optional<LobbyConfiguration.LobbyItem> identify(ItemStack stack) {
        if (stack == null || !stack.hasItemMeta()) {
            return Optional.empty();
        }

        ItemMeta meta = stack.getItemMeta();
        if (meta == null) {
            return Optional.empty();
        }

        String id = meta.getPersistentDataContainer().get(key, PersistentDataType.STRING);
        return id == null ? Optional.empty() : Optional.ofNullable(config.items().get(id));
    }

    private ItemStack build(LobbyConfiguration.LobbyItem item) {
        ItemStack stack = Icons.of(item.material(), item.name(), item.lore());
        ItemMeta meta = stack.getItemMeta();

        if (meta != null) {
            meta.getPersistentDataContainer().set(key, PersistentDataType.STRING, item.id());
            stack.setItemMeta(meta);
        }

        return stack;
    }
}
