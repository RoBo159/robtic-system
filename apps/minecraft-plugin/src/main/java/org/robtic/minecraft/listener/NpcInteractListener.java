package org.robtic.minecraft.listener;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.robtic.minecraft.gui.ExchangeController;

import java.util.List;

/**
 * Opens the exchange when a player right-clicks a configured NPC. Matching on the entity's display
 * name rather than on a Citizens API type means this works with Citizens and with any other NPC
 * plugin, and adds no compile-time dependency on either.
 */
public final class NpcInteractListener implements Listener {

    private final ExchangeController controller;
    private final List<String> npcNames;

    public NpcInteractListener(ExchangeController controller, List<String> npcNames) {
        this.controller = controller;
        // Normalised the same way the NPC's own name is below, so a plain name in config.yml still
        // matches an NPC whose display name carries colour codes.
        this.npcNames = npcNames.stream().map(NpcHooks::normalise).toList();
    }

    @EventHandler
    public void onInteract(PlayerInteractEntityEvent event) {
        Entity entity = event.getRightClicked();
        Component name = entity.customName();
        if (name == null) {
            return;
        }

        String plain = NpcHooks.normalise(PlainTextComponentSerializer.plainText().serialize(name));
        if (!npcNames.contains(plain)) {
            return;
        }

        event.setCancelled(true);

        if (event.getPlayer() instanceof Player player) {
            controller.openMain(player);
        }
    }
}
