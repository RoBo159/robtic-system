package org.robtic.essentials.lobby;

import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Holds notifications back while a player has a menu open, and delivers them once it closes.
 *
 * <h2>Why this exists</h2>
 *
 * Chat still renders behind an open inventory, so a friend request arriving mid-menu is written to
 * a screen the player cannot see and is gone by the time they close it. Queueing turns that into a
 * message they actually read.
 *
 * <h2>Delivered exactly once</h2>
 *
 * Entries are drained — removed as they are sent — so a player who opens and closes three menus in
 * a row does not see the same gift announced three times. The queue is per session and in memory:
 * a notification nobody was online to receive is not worth persisting, and the underlying facts
 * (the friend request, the gift already in their inventory) survive on their own.
 */
public final class LobbyNotifications {

    /** Bounded so a player idling in a menu cannot accumulate an unbounded backlog. */
    private static final int MAX_QUEUED = 20;

    private final Plugin plugin;
    private final MessageCatalog messages;

    private final Map<UUID, Deque<Component>> queued = new ConcurrentHashMap<>();

    public LobbyNotifications(Plugin plugin, MessageCatalog messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    /**
     * Sends now, or queues when a menu is open.
     *
     * The one entry point every caller uses, so no feature has to remember to check whether the
     * player is looking at a GUI.
     */
    public void send(Player player, Component message) {
        if (!hasMenuOpen(player)) {
            player.sendMessage(message);
            return;
        }

        Deque<Component> queue = queued.computeIfAbsent(player.getUniqueId(), key -> new ArrayDeque<>());

        synchronized (queue) {
            if (queue.size() >= MAX_QUEUED) {
                queue.pollFirst();
            }
            queue.addLast(message);
        }
    }

    /** Convenience for the common case of a message-catalog key. */
    public void send(Player player, String key, Object... placeholders) {
        send(player, messages.prefixed(key, placeholders));
    }

    /**
     * Delivers everything held for a player.
     *
     * Run one tick after the close event, because Bukkit still reports the inventory as open while
     * that event is being handled — flushing immediately would queue straight back into itself.
     */
    public void flushLater(Player player) {
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> flush(player), 1L);
    }

    /** Main thread only. */
    public void flush(Player player) {
        if (hasMenuOpen(player)) {
            return;
        }

        Deque<Component> queue = queued.remove(player.getUniqueId());
        if (queue == null) {
            return;
        }

        List<Component> pending;
        synchronized (queue) {
            pending = new ArrayList<>(queue);
        }

        if (pending.isEmpty()) {
            return;
        }

        player.sendMessage(messages.prefixed("lobby.notifications-header", "count", String.valueOf(pending.size())));
        pending.forEach(player::sendMessage);
    }

    public void forget(UUID uuid) {
        queued.remove(uuid);
    }

    /**
     * Whether the player is looking at one of our menus or any other container.
     *
     * The player's own inventory reports as an open `CRAFTING` view at all times, which is why that
     * type is treated as "nothing open" rather than a menu.
     */
    private static boolean hasMenuOpen(Player player) {
        return switch (player.getOpenInventory().getType()) {
            case CRAFTING, CREATIVE, PLAYER -> false;
            default -> true;
        };
    }

    /** Whether anything is waiting, for the close listener to avoid scheduling a pointless task. */
    public boolean hasQueued(Player player) {
        Deque<Component> queue = queued.get(player.getUniqueId());
        return queue != null && !queue.isEmpty();
    }

    /** Delivers to a player by uuid when they happen to be online; drops it otherwise. */
    public void sendIfOnline(UUID uuid, Component message) {
        Player player = Bukkit.getPlayer(uuid);
        if (player != null) {
            send(player, message);
        }
    }
}
