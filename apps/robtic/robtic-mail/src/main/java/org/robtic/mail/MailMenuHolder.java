package org.robtic.mail;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Marks an inventory as the mailbox and records which mail each slot holds.
 *
 * The same holder pattern every other menu in this plugin uses, and for the same reason: a title
 * match would be forgeable by renaming a chest, while a holder is constructed by the plugin and
 * cannot be faked. Carrying the {@link Mail} itself rather than an id means opening the book costs
 * no second lookup — the mailbox has already been fetched by the time a slot can be clicked.
 */
public final class MailMenuHolder implements InventoryHolder {

    private final Map<Integer, Mail> slots = new HashMap<>();
    private Inventory inventory;

    public void bind(int slot, Mail mail) {
        slots.put(slot, mail);
    }

    public Optional<Mail> at(int slot) {
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
