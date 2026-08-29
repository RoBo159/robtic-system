package org.robtic.minecraft.listener;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.service.ChatBridgeService;

import java.util.logging.Level;

/**
 * Forwards public in-game chat to Discord.
 *
 * Runs at MONITOR on the already-async chat event, so a message another plugin cancelled is never
 * relayed and the network call stays off the main thread without extra scheduling.
 *
 * Staff chat does not pass through here — it has its own command and its own channel, precisely so
 * a staff message can never leak into the public bridge by accident.
 */
public final class PlayerChatListener implements Listener {

    private static final String BRIDGE_PERMISSION = "robtic.chat.bridge";

    private final Plugin plugin;
    private final ChatBridgeService chat;

    public PlayerChatListener(Plugin plugin, ChatBridgeService chat) {
        this.plugin = plugin;
        this.chat = chat;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();
        if (!player.hasPermission(BRIDGE_PERMISSION)) {
            return;
        }

        String message = PlainTextComponentSerializer.plainText().serialize(event.message());
        if (message.isBlank()) {
            return;
        }

        try {
            chat.sendToDiscord(player.getUniqueId(), player.getName(), message);
        } catch (RuntimeException error) {
            plugin.getLogger().log(Level.WARNING, "Failed to queue chat for Discord", error);
        }
    }
}
