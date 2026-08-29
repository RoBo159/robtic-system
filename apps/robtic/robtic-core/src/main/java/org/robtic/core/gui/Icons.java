package org.robtic.core.gui;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Material;
import org.bukkit.OfflinePlayer;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.inventory.meta.SkullMeta;

import java.util.ArrayList;
import java.util.List;

/**
 * Menu icon construction.
 *
 * One place for it because every menu needs the same three things: italics switched off (Minecraft
 * italicises custom names by default, which reads as a rendering bug), legacy colour codes parsed,
 * and lore built from a varargs list without the caller assembling components by hand.
 */
public final class Icons {

    private static final LegacyComponentSerializer SERIALIZER = LegacyComponentSerializer.legacyAmpersand();

    private Icons() {
    }

    public static ItemStack of(Material material, String name, String... loreLines) {
        return of(material, name, List.of(loreLines));
    }

    public static ItemStack of(Material material, String name, List<String> loreLines) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();

        if (meta == null) {
            return stack;
        }

        meta.displayName(SERIALIZER.deserialize(name).decoration(TextDecoration.ITALIC, false));
        meta.lore(renderLore(loreLines));
        stack.setItemMeta(meta);

        return stack;
    }

    /** A player head. Falls back to a plain skull when the profile cannot be resolved. */
    public static ItemStack head(OfflinePlayer player, String name, List<String> loreLines) {
        ItemStack stack = new ItemStack(Material.PLAYER_HEAD);
        ItemMeta meta = stack.getItemMeta();

        if (meta instanceof SkullMeta skull) {
            skull.setOwningPlayer(player);
        }

        if (meta != null) {
            meta.displayName(SERIALIZER.deserialize(name).decoration(TextDecoration.ITALIC, false));
            meta.lore(renderLore(loreLines));
            stack.setItemMeta(meta);
        }

        return stack;
    }

    /** A filler pane, used to stop a menu reading as a half-empty chest. */
    public static ItemStack filler() {
        return of(Material.GRAY_STAINED_GLASS_PANE, " ");
    }

    private static List<Component> renderLore(List<String> loreLines) {
        List<Component> lore = new ArrayList<>(loreLines.size());
        for (String line : loreLines) {
            lore.add(SERIALIZER.deserialize(line).decoration(TextDecoration.ITALIC, false));
        }
        return lore;
    }
}
