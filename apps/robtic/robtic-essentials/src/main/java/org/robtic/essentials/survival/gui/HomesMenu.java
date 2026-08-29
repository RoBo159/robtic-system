package org.robtic.essentials.survival.gui;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.gui.Icons;
import org.robtic.essentials.model.SurvivalModels.Home;
import org.robtic.essentials.model.SurvivalModels.Homes;

import java.util.ArrayList;
import java.util.List;

/**
 * `/homes` — the home list as a clickable menu.
 *
 * Rendered entirely from the cached list handed in by the command, so opening it costs nothing and
 * it still works during an outage. The menu never fetches anything itself.
 */
public final class HomesMenu {

    /** Six rows: five for homes, the last for the summary. Enough for every tier's limit. */
    private static final int SIZE = 54;
    private static final int SUMMARY_SLOT = 49;

    private final MessageCatalog messages;

    public HomesMenu(MessageCatalog messages) {
        this.messages = messages;
    }

    public void open(Player player, Homes homes) {
        SurvivalMenuHolder<String> holder = new SurvivalMenuHolder<>(SurvivalMenuHolder.View.HOMES);
        Inventory inventory = Bukkit.createInventory(holder, SIZE, MessageCatalog.render(messages.text("survival.homes-title")));
        holder.attach(inventory);

        int slot = 0;
        for (Home home : homes.homes()) {
            if (slot >= SIZE - 9) {
                break;
            }

            inventory.setItem(slot, Icons.of(
                    Material.RED_BED,
                    "&a" + home.name(),
                    lore(home)));
            holder.bind(slot, home.name());
            slot++;
        }

        inventory.setItem(SUMMARY_SLOT, Icons.of(
                Material.BOOK,
                "&6Homes",
                List.of(
                        "&7Used: &f" + homes.used() + "&7/&f" + homes.limit(),
                        "&7Rank: &f" + (homes.tierName() == null ? "None" : homes.tierName()),
                        "",
                        "&8Set one with /sethome <name>")));

        player.openInventory(inventory);
    }

    private static List<String> lore(Home home) {
        List<String> lore = new ArrayList<>();
        lore.add("&7" + home.location().world());
        lore.add("&7" + Math.round(home.location().x())
                + ", " + Math.round(home.location().y())
                + ", " + Math.round(home.location().z()));
        lore.add("");
        lore.add("&eClick to teleport");
        return lore;
    }
}
