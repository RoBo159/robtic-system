package org.robtic.essentials.lobby;

import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.essentials.lobby.gui.LobbyMenus;
import org.robtic.essentials.survival.SurvivalCacheService;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Right-clicking another player in the lobby, and the item transfer that can follow.
 *
 * <h2>Item transfer is the delicate part</h2>
 *
 * Giving an item moves a real stack between two inventories, so it has exactly two failure modes
 * worth designing against: losing it, and duplicating it. Both are avoided the same way — the stack
 * is removed from the giver *first* and only then offered to the receiver, and every precondition
 * is re-checked at the moment of transfer rather than at the moment the menu was opened.
 *
 * The window between opening the confirmation and clicking it is where everything goes wrong: the
 * giver can swap items, drop the stack, or disconnect; the receiver can leave or fill their
 * inventory. {@link #transfer} therefore trusts nothing the menu recorded except who the target is.
 */
public final class LobbyPlayerInteraction {

    private final Plugin plugin;
    private final LobbyConfiguration config;
    private final MessageCatalog messages;
    private final ApiGateway gateway;
    private final SurvivalCacheService cache;
    private final LobbyMenus menus;
    private final LobbyNotifications notifications;
    private final LobbyItems items;

    /** Last interaction per player, so a double right-click does not open two menus. */
    private final Map<UUID, Long> lastInteraction = new ConcurrentHashMap<>();

    public LobbyPlayerInteraction(
            Plugin plugin,
            LobbyConfiguration config,
            MessageCatalog messages,
            ApiGateway gateway,
            SurvivalCacheService cache,
            LobbyMenus menus,
            LobbyNotifications notifications,
            LobbyItems items
    ) {
        this.plugin = plugin;
        this.config = config;
        this.messages = messages;
        this.gateway = gateway;
        this.cache = cache;
        this.menus = menus;
        this.notifications = notifications;
        this.items = items;
    }

    /** Rate-limits the right-click, which fires readily enough to open a menu twice. */
    public boolean onCooldown(Player player) {
        long now = System.currentTimeMillis();
        Long previous = lastInteraction.put(player.getUniqueId(), now);

        return previous != null && now - previous < config.interactCooldownMillis();
    }

    /**
     * Opens the player menu.
     *
     * The friend list is loaded off-thread first because the menu's shape depends on it — showing
     * "add friend" to somebody who is already a friend would be worse than the brief delay.
     */
    public void openPlayerMenu(Player viewer, Player target) {
        gateway.read(
                () -> {
                    var friends = cache.loadFriends(viewer.getUniqueId(), onlineCsv());
                    boolean targetPrivate = cache.loadSettings(target.getUniqueId()).privateProfile();
                    return new MenuData(friends, targetPrivate);
                },
                data -> {
                    if (!target.isOnline()) {
                        viewer.sendMessage(messages.prefixed("friend.not-online", "player", target.getName()));
                        return;
                    }

                    viewer.openInventory(menus.playerMenu(viewer, target, data.friends(), data.targetPrivate()));
                    config.clickSound().ifPresent(sound -> viewer.playSound(viewer, sound, 1f, 1f));
                },
                error -> viewer.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private record MenuData(org.robtic.essentials.model.SurvivalModels.Friends friends, boolean targetPrivate) {
    }

    /**
     * Transfers the giver's held item to the target.
     *
     * <h2>Ordering</h2>
     *
     * Space is checked, then the stack is removed, then it is added. Removing first is what makes
     * duplication impossible: if the add somehow failed the item would be returned explicitly, and
     * the alternative ordering — add then remove — leaves a window where both players hold it.
     *
     * Main thread only: it touches two inventories.
     *
     * @return true when the transfer happened.
     */
    public boolean transfer(Player giver, Player target) {
        // Everything is re-read here rather than trusted from the menu: the held item may have
        // changed, and either player may have left, since the confirmation was opened.
        if (!target.isOnline()) {
            giver.sendMessage(messages.prefixed("lobby.give-target-gone"));
            return false;
        }

        ItemStack held = giver.getInventory().getItemInMainHand();

        if (held.getType().isAir() || held.getAmount() <= 0) {
            giver.sendMessage(messages.prefixed("lobby.give-nothing-held"));
            return false;
        }

        // A lobby item is furniture, not property — giving one would put a menu opener into
        // somebody's survival inventory.
        if (items.isLobbyItem(held)) {
            giver.sendMessage(messages.prefixed("lobby.give-not-allowed"));
            return false;
        }

        if (target.getInventory().firstEmpty() == -1) {
            giver.sendMessage(messages.prefixed("lobby.give-target-full", "player", target.getName()));
            return false;
        }

        ItemStack gift = held.clone();

        // Removed first. Nothing can duplicate from here: the giver no longer holds it.
        giver.getInventory().setItemInMainHand(null);

        Map<Integer, ItemStack> rejected = target.getInventory().addItem(gift);

        // Only reachable if the inventory filled between the check and the add. The remainder goes
        // back to the giver rather than being dropped on the floor or silently lost.
        if (!rejected.isEmpty()) {
            rejected.values().forEach(leftover -> giver.getInventory().addItem(leftover));
            giver.sendMessage(messages.prefixed("lobby.give-target-full", "player", target.getName()));
            return false;
        }

        giver.sendMessage(messages.prefixed("lobby.give-sent",
                "amount", String.valueOf(gift.getAmount()),
                "item", describe(gift),
                "player", target.getName()));

        // Queued rather than sent: the receiver may well be looking at a menu of their own.
        notifications.send(target, "lobby.give-received",
                "player", giver.getName(),
                "amount", String.valueOf(gift.getAmount()),
                "item", describe(gift));

        return true;
    }


    /** The item's display name when it has one, otherwise a readable form of its type. */
    private static String describe(ItemStack stack) {
        if (stack.hasItemMeta() && stack.getItemMeta() != null && stack.getItemMeta().hasDisplayName()) {
            return net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer.plainText()
                    .serialize(stack.getItemMeta().displayName());
        }

        String raw = stack.getType().name().toLowerCase(java.util.Locale.ROOT).replace('_', ' ');
        return Character.toUpperCase(raw.charAt(0)) + raw.substring(1);
    }

    private String onlineCsv() {
        return String.join(",", plugin.getServer().getOnlinePlayers().stream()
                .map(online -> online.getUniqueId().toString())
                .toList());
    }

    public void forget(UUID uuid) {
        lastInteraction.remove(uuid);
    }
}
