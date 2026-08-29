package org.robtic.mail;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.plugin.Plugin;

/**
 * Clicks in the mailbox.
 *
 * Every interaction is cancelled first and unconditionally: the mailbox is a display, and the one
 * thing that must never happen is a player dragging a written book out of it into their inventory.
 */
public final class MailMenuListener implements Listener {

    private final Plugin plugin;
    private final MailService mail;
    private final MailMenu menu;

    public MailMenuListener(Plugin plugin, MailService mail, MailMenu menu) {
        this.plugin = plugin;
        this.mail = mail;
        this.menu = menu;
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getInventory().getHolder() instanceof MailMenuHolder) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getInventory().getHolder() instanceof MailMenuHolder holder)) {
            return;
        }

        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        // Clicks in the player's own inventory while the mailbox is open are cancelled, not acted on.
        if (event.getClickedInventory() == null || !event.getClickedInventory().equals(event.getInventory())) {
            return;
        }

        holder.at(event.getSlot()).ifPresent(letter -> open(player, letter));
    }

    /**
     * Opens the letter.
     *
     * The menu is closed and the book opened a tick later. Opening a book from inside an
     * {@code InventoryClickEvent} means asking the client to swap screens while it is still
     * processing the click on the one being replaced, and the book silently fails to appear.
     */
    private void open(Player player, Mail letter) {
        player.closeInventory();
        mail.markRead(player, letter);

        plugin.getServer().getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) {
                menu.openBook(player, letter);
            }
        });
    }
}
