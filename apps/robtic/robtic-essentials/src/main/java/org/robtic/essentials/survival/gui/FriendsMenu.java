package org.robtic.essentials.survival.gui;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.gui.Icons;
import org.robtic.essentials.model.SurvivalModels.Friend;
import org.robtic.essentials.model.SurvivalModels.FriendRequest;
import org.robtic.essentials.model.SurvivalModels.Friends;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * `/friends` — the friend list, pending requests and the teleport preference.
 *
 * Rendered from the list handed in, never fetched here. Each friend's head carries their online
 * state, premium tier and last-seen time, and clicking one attempts a teleport.
 */
public final class FriendsMenu {

    private static final int SIZE = 54;
    private static final int REQUESTS_SLOT = 48;
    private static final int SETTINGS_SLOT = 50;

    private final MessageCatalog messages;

    public FriendsMenu(MessageCatalog messages) {
        this.messages = messages;
    }

    public void open(Player player, Friends friends) {
        SurvivalMenuHolder<UUID> holder = new SurvivalMenuHolder<>(SurvivalMenuHolder.View.FRIENDS);
        Inventory inventory = Bukkit.createInventory(holder, SIZE, MessageCatalog.render(messages.text("friend.menu-title")));
        holder.attach(inventory);

        int slot = 0;
        for (Friend friend : friends.friends()) {
            if (slot >= SIZE - 9) {
                break;
            }

            inventory.setItem(slot, Icons.head(
                    Bukkit.getOfflinePlayer(friend.uuid()),
                    (friend.online() ? "&a" : "&7") + friend.username(),
                    lore(friend)));
            holder.bind(slot, friend.uuid());
            slot++;
        }

        if (friends.friends().isEmpty()) {
            inventory.setItem(22, Icons.of(Material.BARRIER, "&7No friends yet",
                    List.of("&8Add one with /friend add <player>")));
        }

        inventory.setItem(REQUESTS_SLOT, Icons.of(
                Material.PAPER,
                "&eRequests",
                requestLore(friends)));

        inventory.setItem(SETTINGS_SLOT, Icons.of(
                friends.autoAcceptTp() ? Material.LIME_DYE : Material.GRAY_DYE,
                "&bTeleport requests",
                List.of(
                        friends.autoAcceptTp() ? "&aFriends teleport instantly" : "&7Friends must ask first",
                        "",
                        "&eClick to switch")));

        player.openInventory(inventory);
    }

    /** The settings view, reachable from the menu or from `/friend settings`. */
    public void openSettings(Player player, boolean autoAccept) {
        SurvivalMenuHolder<Boolean> holder = new SurvivalMenuHolder<>(SurvivalMenuHolder.View.FRIEND_SETTINGS);
        Inventory inventory = Bukkit.createInventory(holder, 27, MessageCatalog.render(messages.text("friend.settings-title")));
        holder.attach(inventory);

        inventory.setItem(11, Icons.of(
                autoAccept ? Material.LIME_DYE : Material.LIGHT_GRAY_DYE,
                "&aAutomatic",
                List.of("&7Friends teleport to you instantly.", "", autoAccept ? "&aSelected" : "&eClick to select")));
        holder.bind(11, true);

        inventory.setItem(15, Icons.of(
                autoAccept ? Material.LIGHT_GRAY_DYE : Material.LIME_DYE,
                "&eAsk me first",
                List.of("&7You approve each teleport.", "", autoAccept ? "&eClick to select" : "&aSelected")));
        holder.bind(15, false);

        player.openInventory(inventory);
    }

    private static List<String> lore(Friend friend) {
        List<String> lore = new ArrayList<>();

        lore.add(friend.online() ? "&aOnline now" : "&7Last seen: &f" + lastSeen(friend.lastSeenAt()));

        if (friend.premiumTier() != null) {
            lore.add("&6✦ " + friend.premiumTier());
        }

        lore.add("");
        lore.add(friend.online() ? "&eClick to teleport" : "&8Offline");
        return lore;
    }

    private static List<String> requestLore(Friends friends) {
        List<String> lore = new ArrayList<>();

        if (friends.incoming().isEmpty()) {
            lore.add("&7No pending requests");
        } else {
            lore.add("&fIncoming:");
            for (FriendRequest request : friends.incoming()) {
                lore.add("&7- &f" + request.username());
            }
            lore.add("");
            lore.add("&8/friend accept <player>");
        }

        if (!friends.outgoing().isEmpty()) {
            lore.add("");
            lore.add("&fSent:");
            for (FriendRequest request : friends.outgoing()) {
                lore.add("&7- &f" + request.username());
            }
        }

        return lore;
    }

    /** A coarse "3d ago" — a friend list does not need minute precision. */
    private static String lastSeen(Long epochMillis) {
        if (epochMillis == null) {
            return "unknown";
        }

        Duration since = Duration.ofMillis(Math.max(0, System.currentTimeMillis() - epochMillis));

        if (since.toDays() > 0) {
            return since.toDays() + "d ago";
        }
        if (since.toHours() > 0) {
            return since.toHours() + "h ago";
        }
        return Math.max(1, since.toMinutes()) + "m ago";
    }
}
