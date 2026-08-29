package org.robtic.minecraft.progression.gui;

import org.robtic.minecraft.util.Robs;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.robtic.minecraft.util.Chat;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds the item stacks the progression menus are made of.
 *
 * Shared so the four menus look like one system rather than four, and so the details that are easy
 * to forget — disabling italics, hiding attribute tooltips — are got right once.
 */
public final class MenuItems {

    /** Filler for slots that do nothing, so a menu reads as a panel rather than a chest. */
    public static final ItemStack FILLER = filler();

    private MenuItems() {
    }

    /**
     * A menu item.
     *
     * Italics are switched off explicitly on every line. Minecraft renames default to italic, which
     * makes a menu built without this look like every line is emphasised — and the fix is per
     * component, so it has to be applied here rather than hoped for.
     */
    public static ItemStack of(Material material, String name, List<String> lore) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();

        if (meta == null) {
            return stack;
        }

        meta.displayName(Chat.component(name).decoration(TextDecoration.ITALIC, false));

        if (!lore.isEmpty()) {
            List<Component> lines = new ArrayList<>(lore.size());

            for (String line : lore) {
                lines.add(Chat.component(line).decoration(TextDecoration.ITALIC, false));
            }

            meta.lore(lines);
        }

        // Hides the "+3 Attack Damage" block that would otherwise appear on any tool used as an
        // icon, which is noise on a menu item nobody is going to swing.
        meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_ADDITIONAL_TOOLTIP,
                ItemFlag.HIDE_ENCHANTS, ItemFlag.HIDE_UNBREAKABLE);

        stack.setItemMeta(meta);
        return stack;
    }

    public static ItemStack of(Material material, String name) {
        return of(material, name, List.of());
    }

    /**
     * The same item with an enchantment shimmer, marking it as selected or rare.
     *
     * The enchantment is hidden by the flags above, so it glows without claiming to do anything.
     */
    public static ItemStack glowing(Material material, String name, List<String> lore) {
        ItemStack stack = of(material, name, lore);
        ItemMeta meta = stack.getItemMeta();

        if (meta != null) {
            meta.addEnchant(Enchantment.UNBREAKING, 1, true);
            stack.setItemMeta(meta);
        }

        return stack;
    }

    private static ItemStack filler() {
        ItemStack stack = new ItemStack(Material.GRAY_STAINED_GLASS_PANE);
        ItemMeta meta = stack.getItemMeta();

        if (meta != null) {
            // An empty name rather than a space: a space still renders a tooltip box on hover.
            meta.displayName(Component.empty());
            stack.setItemMeta(meta);
        }

        return stack;
    }

    /**
     * A progress bar as coloured blocks, e.g. {@code ██████░░░░ 62%}.
     *
     * Text rather than an item, because a bar made of items would need ten inventory slots and would
     * still be less legible than one line of lore.
     */
    public static String progressBar(double fraction, int width) {
        int filled = (int) Math.round(Math.max(0.0d, Math.min(1.0d, fraction)) * width);

        return "&a" + "█".repeat(filled)
                + "&8" + "█".repeat(Math.max(0, width - filled))
                + " &7" + Math.round(fraction * 100) + "%";
    }

    /**
     * Formats a large number with thousands separators.
     *
     * XP totals reach seven figures in a long-lived job, and an unformatted one is genuinely hard to
     * read at a glance.
     */
    public static String number(long value) {
        return java.text.NumberFormat.getInstance(java.util.Locale.ROOT).format(value);
    }

    /**
     * An amount of robs.
     *
     * Separate from {@link #number} rather than an overload of it, because the two are formatted to
     * different rules and the compiler picking between them by argument type is exactly how a
     * storage count ends up rendered as currency. Robs carry two decimal places and drop trailing
     * zeros, so a whole amount still reads as {@code 5,000} — see {@link Robs#format}.
     */
    public static String robs(double amount) {
        return Robs.format(amount);
    }

    /** A back button, used identically by every sub-menu. */
    public static ItemStack back(String label) {
        return of(Material.ARROW, "&7← " + label);
    }

    /** A page button, greyed out when there is nowhere to go. */
    public static ItemStack page(String label, boolean enabled) {
        return enabled
                ? of(Material.ARROW, "&e" + label)
                : of(Material.GRAY_DYE, "&8" + label);
    }

    /** Turns an Adventure colour into the closest legacy code, for lore strings. */
    public static String legacy(net.kyori.adventure.text.format.TextColor color) {
        return org.robtic.minecraft.progression.api.Colors.toLegacy(color);
    }

    /** Strips colour codes, for places that need the plain text. */
    public static String plain(String text) {
        return text.replaceAll("[&§].", "");
    }
}
