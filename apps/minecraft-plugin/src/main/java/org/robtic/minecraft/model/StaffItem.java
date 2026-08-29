package org.robtic.minecraft.model;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * One entry from `items.yml`: the tool a staff member is given, and what clicking it does.
 *
 * Material, name, lore, enchantments, glow, slot, action, cooldown and permission all come from
 * the file. Nothing about the hotbar is compiled in, so an operator can rebuild the staff kit
 * without touching the plugin.
 */
public record StaffItem(
        String id,
        Material material,
        String displayName,
        List<String> lore,
        Map<Enchantment, Integer> enchantments,
        boolean glow,
        int slot,
        /** Action id dispatched on a left click, or blank for none. */
        String leftAction,
        /** Action id dispatched on a right click, or blank for none. */
        String rightAction,
        long cooldownMillis,
        String permission
) {

    private static final LegacyComponentSerializer SERIALIZER = LegacyComponentSerializer.legacyAmpersand();

    /**
     * Builds the stack.
     *
     * Italics are switched off explicitly because Minecraft italicises any custom display name by
     * default, which makes a carefully coloured name look like an accident.
     */
    public ItemStack toItemStack() {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();

        if (meta == null) {
            return stack;
        }

        meta.displayName(SERIALIZER.deserialize(displayName).decoration(TextDecoration.ITALIC, false));

        if (!lore.isEmpty()) {
            List<Component> rendered = new ArrayList<>(lore.size());
            for (String line : lore) {
                rendered.add(SERIALIZER.deserialize(line).decoration(TextDecoration.ITALIC, false));
            }
            meta.lore(rendered);
        }

        for (Map.Entry<Enchantment, Integer> entry : enchantments.entrySet()) {
            meta.addEnchant(entry.getKey(), entry.getValue(), true);
        }

        // The glow effect is an enchantment with its tooltip hidden — the standard trick, and the
        // only way to get a glint without a real enchantment showing in the lore.
        if (glow && enchantments.isEmpty()) {
            meta.addEnchant(Enchantment.UNBREAKING, 1, true);
        }
        if (glow || !enchantments.isEmpty()) {
            meta.addItemFlags(ItemFlag.HIDE_ENCHANTS);
        }

        meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean hasCooldown() {
        return cooldownMillis > 0;
    }
}
