package org.robtic.minecraft.gui;

import org.robtic.minecraft.util.Robs;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.robtic.minecraft.model.ItemPrice;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Builds the exchange inventories. Nothing here reads the database — the caller resolves prices
 * and balances first, so the menus can be assembled on the main thread without blocking it.
 */
public final class ExchangeMenu {

    /** Bottom-row slot that sells everything the player is carrying. */
    public static final int SELL_ALL_SLOT_OFFSET = 4;
    /** Bottom-row slot showing the current balance. */
    public static final int BALANCE_SLOT_OFFSET = 8;
    /** Slot in the item view that confirms the sale. */
    public static final int CONFIRM_SLOT = 15;
    /** Slot in the item view that returns to the main menu. */
    public static final int BACK_SLOT = 11;

    private final String title;
    private final int rows;

    public ExchangeMenu(String title, int rows) {
        this.title = title;
        this.rows = rows;
    }

    /** The item grid, plus a sell-everything button and a balance display. */
    public Inventory buildMain(List<ItemPrice> prices, Map<String, Integer> carried, double balance) {
        ExchangeHolder holder = new ExchangeHolder(ExchangeHolder.View.MAIN, null);
        Inventory inventory = Bukkit.createInventory(holder, rows * 9, Component.text(title));
        holder.attach(inventory);

        int gridSlots = (rows - 1) * 9;
        for (int index = 0; index < prices.size() && index < gridSlots; index++) {
            ItemPrice price = prices.get(index);
            int owned = carried.getOrDefault(price.itemKey(), 0);

            inventory.setItem(index, icon(
                    price.material(),
                    price.displayName(),
                    List.of(
                            line("Price", price.price() + " robs each"),
                            line("In inventory", String.valueOf(owned)),
                            line("Worth", (price.price() * owned) + " robs"),
                            Component.empty(),
                            Component.text("Click to sell this item", NamedTextColor.YELLOW)
                    )
            ));
            holder.bindSlot(index, price.itemKey());
        }

        int bottom = gridSlots;
        inventory.setItem(bottom + SELL_ALL_SLOT_OFFSET, icon(
                Material.HOPPER,
                "Sell Inventory",
                List.of(Component.text("Sell every priced item you carry", NamedTextColor.GRAY))
        ));

        inventory.setItem(bottom + BALANCE_SLOT_OFFSET, icon(
                Material.SUNFLOWER,
                "Current Coins",
                List.of(Component.text(Robs.format(balance), NamedTextColor.GOLD))
        ));

        return inventory;
    }

    /** The confirmation view for one item: amount carried, unit price, total, and a sell button. */
    public Inventory buildItemView(ItemPrice price, int owned, double balance) {
        ExchangeHolder holder = new ExchangeHolder(ExchangeHolder.View.ITEM, price.itemKey());
        Inventory inventory = Bukkit.createInventory(holder, 27, Component.text(title + " — " + price.displayName()));
        holder.attach(inventory);

        inventory.setItem(13, icon(
                price.material(),
                price.displayName(),
                List.of(
                        line("Inventory amount", String.valueOf(owned)),
                        line("Current price", Robs.format(price.price()) + " robs each"),
                        line("Coins earned", Robs.format(Robs.multiply(price.price(), owned)))
                )
        ));

        inventory.setItem(BACK_SLOT, icon(
                Material.ARROW,
                "Back",
                List.of(Component.text("Return to the exchange", NamedTextColor.GRAY))
        ));

        inventory.setItem(CONFIRM_SLOT, icon(
                owned > 0 ? Material.LIME_CONCRETE : Material.GRAY_CONCRETE,
                owned > 0 ? "Sell " + owned : "Nothing to sell",
                List.of(
                        line("You receive", Robs.format(Robs.multiply(price.price(), owned)) + " robs"),
                        line("New balance", Robs.format(Robs.add(balance, Robs.multiply(price.price(), owned))) + " robs")
                )
        ));

        return inventory;
    }

    private ItemStack icon(Material material, String name, List<Component> lore) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();

        meta.displayName(Component.text(name, NamedTextColor.AQUA).decoration(TextDecoration.ITALIC, false));
        meta.lore(new ArrayList<>(lore.stream()
                .map(component -> component.decoration(TextDecoration.ITALIC, false))
                .toList()));

        stack.setItemMeta(meta);
        return stack;
    }

    private Component line(String label, String value) {
        return Component.text(label + ": ", NamedTextColor.GRAY).append(Component.text(value, NamedTextColor.WHITE));
    }
}
