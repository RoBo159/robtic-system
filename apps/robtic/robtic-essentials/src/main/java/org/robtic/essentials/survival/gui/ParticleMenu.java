package org.robtic.essentials.survival.gui;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.gui.Icons;
import org.robtic.essentials.survival.cosmetic.ParticleService;

import java.util.List;

/** `/particle` — the picker. Selecting an icon is the same action as typing the name. */
public final class ParticleMenu {

    private static final int SIZE = 27;
    private static final int OFF_SLOT = 22;

    private final MessageCatalog messages;

    public ParticleMenu(MessageCatalog messages) {
        this.messages = messages;
    }

    public void open(Player player, String selected) {
        SurvivalMenuHolder<String> holder = new SurvivalMenuHolder<>(SurvivalMenuHolder.View.PARTICLES);
        Inventory inventory = Bukkit.createInventory(holder, SIZE, MessageCatalog.render(messages.text("survival.particle-title")));
        holder.attach(inventory);

        int slot = 0;
        for (String particle : ParticleService.AVAILABLE) {
            boolean active = particle.equalsIgnoreCase(selected);

            inventory.setItem(slot, Icons.of(
                    active ? Material.GLOWSTONE_DUST : Material.GUNPOWDER,
                    (active ? "&a" : "&f") + pretty(particle),
                    List.of(active ? "&aSelected" : "&eClick to select")));
            holder.bind(slot, particle);
            slot++;
        }

        inventory.setItem(OFF_SLOT, Icons.of(
                Material.BARRIER,
                "&cTurn off",
                List.of("&7Stop showing a particle trail.")));
        // The sentinel the click handler recognises; no real particle is named "OFF".
        holder.bind(OFF_SLOT, "OFF");

        player.openInventory(inventory);
    }

    /** FLAME → Flame, SOUL_FIRE_FLAME → Soul Fire Flame. */
    private static String pretty(String raw) {
        String[] words = raw.toLowerCase(java.util.Locale.ROOT).split("_");
        StringBuilder out = new StringBuilder();

        for (String word : words) {
            if (word.isEmpty()) {
                continue;
            }
            if (!out.isEmpty()) {
                out.append(' ');
            }
            out.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }

        return out.toString();
    }
}
