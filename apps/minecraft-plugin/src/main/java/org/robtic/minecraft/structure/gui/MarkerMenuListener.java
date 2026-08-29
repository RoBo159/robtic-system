package org.robtic.minecraft.structure.gui;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.ItemStack;
import org.robtic.minecraft.structure.api.MarkerRegistry;
import org.robtic.minecraft.structure.api.MarkerType;
import org.robtic.minecraft.structure.config.MarkerSettings;
import org.robtic.minecraft.util.Chat;

import java.util.Optional;
import java.util.function.Supplier;

/**
 * Turns clicks in the marker menu into marker items.
 *
 * <h2>Everything is cancelled first</h2>
 *
 * The menu is a read-only surface: every click and every drag inside it is cancelled before anything
 * else is considered. A menu that cancels selectively is one shift-click away from letting a player
 * pull a decoration item out of it, and the entries here are ordinary items with no protection of
 * their own.
 */
public final class MarkerMenuListener implements Listener {

    private final MarkerMenu menu;
    private final MarkerRegistry registry;
    private final Supplier<MarkerSettings> settings;

    public MarkerMenuListener(MarkerMenu menu, MarkerRegistry registry, Supplier<MarkerSettings> settings) {
        this.menu = menu;
        this.registry = registry;
        this.settings = settings;
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getInventory().getHolder() instanceof MarkerMenuHolder) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getInventory().getHolder() instanceof MarkerMenuHolder holder)) {
            return;
        }

        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        // A click in the player's own inventory while the menu is open: cancelled above so nothing
        // can be shift-moved in, and otherwise ignored.
        if (event.getClickedInventory() == null
                || !event.getClickedInventory().equals(event.getInventory())) {
            return;
        }

        int slot = event.getSlot();
        int rows = settings.get().menuRows();

        String tab = holder.tabAt(slot);

        if (tab != null) {
            menu.open(player, tab, 0);
            return;
        }

        if (slot == MarkerMenu.previousSlot(rows)) {
            menu.open(player, holder.categoryId(), Math.max(0, holder.page() - 1));
            return;
        }

        if (slot == MarkerMenu.nextSlot(rows)) {
            menu.open(player, holder.categoryId(), holder.page() + 1);
            return;
        }

        String typeId = holder.typeAt(slot);

        if (typeId == null) {
            return;
        }

        give(player, typeId);
    }

    /**
     * Hands over one marker.
     *
     * A full inventory drops the marker at the player's feet rather than silently swallowing it. The
     * alternative — refusing with a message — is technically tidier and is the wrong call for a
     * builder who is mid-flight in creative with a full hotbar.
     */
    private void give(Player player, String typeId) {
        Optional<MarkerType> type = registry.get(typeId);

        if (type.isEmpty()) {
            // The type was unregistered while the menu was open — a reload, or a module unloading.
            player.sendMessage(Chat.component(
                    "&cThat marker type is no longer registered. Reopen the menu."));
            return;
        }

        ItemStack item = menu.itemFor(type.get());

        var leftover = player.getInventory().addItem(item);

        if (!leftover.isEmpty()) {
            leftover.values().forEach(dropped ->
                    player.getWorld().dropItem(player.getLocation(), dropped));

            player.sendMessage(Chat.component(
                    "&7Your inventory was full, so the marker was dropped at your feet."));
            return;
        }

        player.sendMessage(Chat.component("&aGave you a &f" + type.get().display() + "&a marker."));
    }
}
