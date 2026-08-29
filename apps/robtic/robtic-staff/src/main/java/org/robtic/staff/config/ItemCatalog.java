package org.robtic.staff.config;

import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.Registry;
import org.bukkit.enchantments.Enchantment;
import org.robtic.staff.model.StaffItem;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * `items.yml` — the staff hotbar.
 *
 * Every property of every tool is configured: material, slot, name, lore, enchantments, glow,
 * the action each click dispatches, a cooldown and a permission. The plugin therefore has no
 * built-in notion of "the blaze rod does freezing" — that binding lives in the file, and an
 * operator can move it to any item without a code change.
 *
 * An entry naming a material or an action that does not exist is skipped with a warning rather
 * than aborting the load: one typo should cost one tool, not the whole staff kit.
 */
public final class ItemCatalog {

    private final Map<String, StaffItem> byId = new LinkedHashMap<>();
    private final List<StaffItem> ordered;

    public ItemCatalog(FileConfiguration config, Logger logger) {
        ConfigurationSection items = config.getConfigurationSection("items");

        if (items != null) {
            for (String key : items.getKeys(false)) {
                ConfigurationSection entry = items.getConfigurationSection(key);
                if (entry == null) {
                    continue;
                }

                Material material = Material.matchMaterial(entry.getString("material", ""));
                if (material == null) {
                    logger.warning("items.yml: \"" + key + "\" names an unknown material \""
                            + entry.getString("material", "") + "\" — skipping it.");
                    continue;
                }

                // Slots are configured 1-9 as an operator counts hotbar positions; Bukkit indexes
                // from 0, so the conversion happens once, here, rather than at every use site.
                int configuredSlot = entry.getInt("slot", 1);
                int slot = Math.min(8, Math.max(0, configuredSlot - 1));

                byId.put(key.toLowerCase(Locale.ROOT), new StaffItem(
                        key.toLowerCase(Locale.ROOT),
                        material,
                        entry.getString("name", key),
                        entry.getStringList("lore"),
                        parseEnchantments(entry.getStringList("enchantments"), key, logger),
                        entry.getBoolean("glow", false),
                        slot,
                        entry.getString("left-action", "").trim().toLowerCase(Locale.ROOT),
                        entry.getString("right-action", "").trim().toLowerCase(Locale.ROOT),
                        Math.max(0L, entry.getLong("cooldown-ms", 0L)),
                        entry.getString("permission", "")
                ));
            }
        }

        List<StaffItem> sorted = new ArrayList<>(byId.values());
        sorted.sort(Comparator.comparingInt(StaffItem::slot));
        this.ordered = List.copyOf(sorted);
    }

    /** Every configured tool, in slot order. */
    public List<StaffItem> all() {
        return ordered;
    }

    public Optional<StaffItem> byId(String id) {
        return Optional.ofNullable(byId.get(id.toLowerCase(Locale.ROOT)));
    }

    public boolean isEmpty() {
        return ordered.isEmpty();
    }

    /**
     * Resolves a held stack back to its catalog entry.
     *
     * Matched on material and display name together. Material alone would let a player carrying an
     * ordinary compass trigger the teleport menu; the name is what distinguishes the issued tool
     * from an identical item found in a chest.
     */
    public Optional<StaffItem> match(Material material, String displayName) {
        if (material == null) {
            return Optional.empty();
        }

        for (StaffItem item : ordered) {
            if (item.material() != material) {
                continue;
            }
            if (displayName == null || displayName.isBlank()) {
                continue;
            }
            if (stripColors(item.displayName()).equalsIgnoreCase(stripColors(displayName))) {
                return Optional.of(item);
            }
        }

        return Optional.empty();
    }

    /**
     * Parses `ENCHANT:LEVEL` entries against the enchantment registry.
     *
     * Enchantment is a registry lookup rather than an enum in modern Paper, so the key is resolved
     * through the registry — `Enchantment.getByName` no longer covers everything.
     */
    private Map<Enchantment, Integer> parseEnchantments(List<String> raw, String itemKey, Logger logger) {
        Map<Enchantment, Integer> parsed = new LinkedHashMap<>();

        for (String line : raw) {
            String[] parts = line.split(":");
            NamespacedKey key = NamespacedKey.fromString(parts[0].trim().toLowerCase(Locale.ROOT));

            Enchantment enchantment = key == null ? null : Registry.ENCHANTMENT.get(key);

            if (enchantment == null) {
                logger.warning("items.yml: \"" + itemKey + "\" names an unknown enchantment \"" + parts[0] + "\".");
                continue;
            }

            int level = 1;
            if (parts.length > 1) {
                try {
                    level = Integer.parseInt(parts[1].trim());
                } catch (NumberFormatException error) {
                    logger.warning("items.yml: \"" + itemKey + "\" has a non-numeric enchantment level \"" + parts[1] + "\".");
                }
            }

            parsed.put(enchantment, level);
        }

        return parsed;
    }

    private static String stripColors(String value) {
        return value.replaceAll("[&§][0-9a-fk-orA-FK-OR]", "").trim();
    }
}
