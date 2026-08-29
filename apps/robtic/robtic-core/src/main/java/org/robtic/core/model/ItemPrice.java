package org.robtic.core.model;

import org.bukkit.Material;

/** One row of the ore-exchange price table, resolved to a Bukkit material. */
public record ItemPrice(String itemKey, Material material, double price, boolean enabled) {

    public String displayName() {
        String[] words = itemKey.toLowerCase().split("_");
        StringBuilder builder = new StringBuilder();
        for (String word : words) {
            if (word.isEmpty()) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append(' ');
            }
            builder.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return builder.toString();
    }
}
