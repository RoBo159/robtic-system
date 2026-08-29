package org.robtic.staff;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;

/**
 * Routes chat into a private report session, and closes sessions on disconnect.
 *
 * <h2>Runs at LOWEST and cancels</h2>
 *
 * The event has to be cancelled before anything else sees it — the Discord chat bridge listens at
 * MONITOR, and a report conversation reaching a public Discord channel is precisely the leak this
 * feature exists to prevent. Cancelling first means the bridge never runs at all for these lines.
 *
 * The relay itself is safe on the async chat thread: it only sends components to two players.
 */
public final class ReportChatListener implements Listener {

    private final Plugin plugin;
    private final ReportChatService chat;

    public ReportChatListener(Plugin plugin, ReportChatService chat) {
        this.plugin = plugin;
        this.chat = chat;
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();

        if (!chat.isInSession(player.getUniqueId())) {
            return;
        }

        // Cancelled before the public bridge or any other listener can observe it.
        event.setCancelled(true);

        String message = PlainTextComponentSerializer.plainText().serialize(event.message());

        if (message.isBlank()) {
            return;
        }

        chat.relay(player, message);
    }

    /**
     * Ends the session when either side leaves.
     *
     * The report stays claimed: the staff member has not finished with it, and releasing it because
     * a connection dropped would put it back in the queue for everybody while it is still being
     * handled.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        chat.handleDisconnect(event.getPlayer().getUniqueId());
    }
}
