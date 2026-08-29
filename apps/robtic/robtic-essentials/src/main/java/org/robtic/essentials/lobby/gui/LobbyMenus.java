package org.robtic.essentials.lobby.gui;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.gui.Icons;
import org.robtic.essentials.lobby.LobbyConfiguration;
import org.robtic.essentials.model.SurvivalModels.Friends;
import org.robtic.essentials.model.SurvivalModels.InventorySnapshot;
import org.robtic.essentials.model.SurvivalModels.PlayerSettings;
import org.robtic.core.util.ItemSerialization;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Builds every lobby menu.
 *
 * <h2>Rendering only</h2>
 *
 * Nothing here reads the API, mutates state or decides what a click does — it turns already-loaded
 * data into an inventory and records what each slot means on the holder. The click handling lives
 * in one listener, and the loading in the services that own the data.
 *
 * That separation is why these can all be built on the main thread safely: by the time a menu is
 * opened, everything it shows is already in memory.
 */
public final class LobbyMenus {

    private final LobbyConfiguration config;
    private final MessageCatalog messages;

    public LobbyMenus(LobbyConfiguration config, MessageCatalog messages) {
        this.config = config;
        this.messages = messages;
    }

    // ─── Player menu ──────────────────────────────────────────────────────────────────────────

    /**
     * The menu shown when right-clicking another player in the lobby.
     *
     * The friend row changes shape with the relationship: strangers get "add", people with a
     * pending request in either direction get the answer to it, and existing friends get teleport
     * and remove. Showing every button and refusing most of them would be worse — the menu is how
     * a player learns what is possible.
     */
    public Inventory playerMenu(Player viewer, Player target, Friends friends, boolean targetPrivate) {
        LobbyMenuHolder holder = new LobbyMenuHolder(LobbyMenuHolder.View.PLAYER, target.getUniqueId());
        Inventory inventory = Bukkit.createInventory(holder, 27, MessageCatalog.render(
                config.playerMenuTitle().replace("%player%", target.getName())));
        holder.attach(inventory);

        inventory.setItem(4, Icons.head(target, "&e" + target.getName(), List.of("&7" + target.getWorld().getName())));

        // Profile — hidden when they have made it private.
        if (targetPrivate) {
            inventory.setItem(10, Icons.of(Material.GRAY_DYE, "&7Profile hidden",
                    List.of("&8This player keeps their profile private.")));
        } else {
            inventory.setItem(10, Icons.of(Material.PLAYER_HEAD, "&aProfile", List.of("&7View their public profile.")));
            holder.bind(10, LobbyMenuHolder.Action.PROFILE);
        }

        bindFriendSlot(inventory, holder, target, friends);

        inventory.setItem(14, Icons.of(Material.CHEST, "&6Give item",
                List.of("&7Offer them the item you are holding.")));
        holder.bind(14, LobbyMenuHolder.Action.GIVE_ITEM);

        inventory.setItem(22, Icons.of(Material.BARRIER, "&cClose", List.of()));
        holder.bind(22, LobbyMenuHolder.Action.CLOSE);

        return inventory;
    }

    /** The friend controls, whose shape depends on the current relationship. */
    private void bindFriendSlot(Inventory inventory, LobbyMenuHolder holder, Player target, Friends friends) {
        boolean isFriend = friends.isFriend(target.getUniqueId());

        boolean incoming = friends.incoming().stream().anyMatch(r -> r.uuid().equals(target.getUniqueId()));
        boolean outgoing = friends.outgoing().stream().anyMatch(r -> r.uuid().equals(target.getUniqueId()));

        if (isFriend) {
            inventory.setItem(12, Icons.of(Material.ENDER_PEARL, "&bTeleport",
                    List.of("&7Ask to teleport to them.")));
            holder.bind(12, LobbyMenuHolder.Action.FRIEND_TELEPORT);

            inventory.setItem(16, Icons.of(Material.RED_DYE, "&cRemove friend",
                    List.of("&7You are friends.")));
            holder.bind(16, LobbyMenuHolder.Action.FRIEND_REMOVE);
            return;
        }

        if (incoming) {
            inventory.setItem(12, Icons.of(Material.LIME_DYE, "&aAccept request",
                    List.of("&7They asked to be your friend.")));
            holder.bind(12, LobbyMenuHolder.Action.FRIEND_ACCEPT);

            inventory.setItem(16, Icons.of(Material.RED_DYE, "&cReject request", List.of()));
            holder.bind(16, LobbyMenuHolder.Action.FRIEND_DENY);
            return;
        }

        if (outgoing) {
            inventory.setItem(12, Icons.of(Material.CLOCK, "&7Request sent",
                    List.of("&8Waiting for them to answer.", "", "&eClick to cancel")));
            holder.bind(12, LobbyMenuHolder.Action.FRIEND_DENY);
            return;
        }

        inventory.setItem(12, Icons.of(Material.LIME_DYE, "&aAdd friend", List.of("&7Send a friend request.")));
        holder.bind(12, LobbyMenuHolder.Action.FRIEND_ADD);
    }

    // ─── Give item ────────────────────────────────────────────────────────────────────────────

    /**
     * The gift confirmation.
     *
     * Shows the exact stack being given, because "the item you are holding" is ambiguous the moment
     * a player has changed slots since opening the menu — the confirmation names what will actually
     * move.
     */
    public Inventory giveMenu(Player giver, Player target, ItemStack held) {
        LobbyMenuHolder holder = new LobbyMenuHolder(LobbyMenuHolder.View.GIVE, target.getUniqueId());
        Inventory inventory = Bukkit.createInventory(holder, 27, MessageCatalog.render(
                config.giveMenuTitle().replace("%player%", target.getName())));
        holder.attach(inventory);

        inventory.setItem(13, held.clone());

        inventory.setItem(11, Icons.of(Material.LIME_CONCRETE, "&aConfirm",
                List.of("&7Give this to &f" + target.getName() + "&7.")));
        holder.bind(11, LobbyMenuHolder.Action.GIVE_CONFIRM);

        inventory.setItem(15, Icons.of(Material.RED_CONCRETE, "&cCancel", List.of()));
        holder.bind(15, LobbyMenuHolder.Action.GIVE_CANCEL);

        return inventory;
    }

    // ─── Information ──────────────────────────────────────────────────────────────────────────

    /** Entirely config-driven: every row, its icon and its action come from lobby.yml. */
    public Inventory informationMenu() {
        LobbyMenuHolder holder = new LobbyMenuHolder(LobbyMenuHolder.View.INFORMATION, null);
        Inventory inventory = Bukkit.createInventory(holder, 27, MessageCatalog.render(config.infoMenuTitle()));
        holder.attach(inventory);

        for (LobbyConfiguration.InfoEntry entry : config.infoEntries()) {
            if (entry.slot() < 0 || entry.slot() >= inventory.getSize()) {
                continue;
            }

            inventory.setItem(entry.slot(), Icons.of(entry.material(), entry.name(), entry.lore()));
            holder.bind(entry.slot(), LobbyMenuHolder.Action.INFO_ENTRY, entry.action() + "|" + entry.value());
        }

        return inventory;
    }

    // ─── Settings ─────────────────────────────────────────────────────────────────────────────

    /**
     * Personal settings.
     *
     * The premium rows are shown to everybody but marked when unavailable, rather than hidden —
     * somebody who cannot use a particle trail should still be able to see that it exists.
     */
    public Inventory settingsMenu(PlayerSettings settings) {
        LobbyMenuHolder holder = new LobbyMenuHolder(LobbyMenuHolder.View.SETTINGS, null);
        Inventory inventory = Bukkit.createInventory(holder, 27, MessageCatalog.render(config.settingsMenuTitle()));
        holder.attach(inventory);

        inventory.setItem(10, toggle(
                settings.playersVisible(),
                "&bPlayer visibility",
                settings.playersVisible() ? "&aShowing other players" : "&7Players hidden"));
        holder.bind(10, LobbyMenuHolder.Action.SETTING_VISIBILITY);

        inventory.setItem(12, toggle(
                settings.friendTpAutoAccept(),
                "&bFriend teleports",
                settings.friendTpAutoAccept() ? "&aFriends teleport instantly" : "&7Friends must ask first"));
        holder.bind(12, LobbyMenuHolder.Action.SETTING_FRIEND_TP);

        inventory.setItem(14, toggle(
                settings.privateProfile(),
                "&bPrivate profile",
                settings.privateProfile() ? "&7Profile hidden from others" : "&aProfile visible"));
        holder.bind(14, LobbyMenuHolder.Action.SETTING_PRIVATE_PROFILE);

        inventory.setItem(16, premiumRow(
                settings.cosmeticsAllowed(),
                Material.BLAZE_POWDER,
                "&bParticles",
                settings.particle() == null ? "&7None selected" : "&a" + settings.particle()));
        holder.bind(16, LobbyMenuHolder.Action.SETTING_PARTICLES);

        inventory.setItem(22, premiumRow(
                settings.cosmeticsAllowed(),
                Material.NAME_TAG,
                "&bJoin message",
                settings.joinMessage() == null ? "&7Default" : "&f" + settings.joinMessage()));
        holder.bind(22, LobbyMenuHolder.Action.SETTING_JOIN_MESSAGE);

        return inventory;
    }

    private static ItemStack toggle(boolean on, String name, String state) {
        return Icons.of(on ? Material.LIME_DYE : Material.GRAY_DYE, name,
                List.of(state, "", "&eClick to change"));
    }

    private static ItemStack premiumRow(boolean allowed, Material material, String name, String state) {
        return Icons.of(allowed ? material : Material.GRAY_DYE, name,
                allowed
                        ? List.of(state, "", "&eClick to change")
                        : List.of(state, "", "&8Premium only"));
    }

    // ─── Survival inventory preview ───────────────────────────────────────────────────────────

    /**
     * A read-only render of the stored survival inventory.
     *
     * Every click in this view is cancelled by the listener, so it cannot be edited, dragged out or
     * dropped. The stacks are clones of the decoded snapshot: even if a click did slip through, it
     * would move a copy that is thrown away when the menu closes rather than a real item.
     */
    public Inventory previewMenu(Player subject, InventorySnapshot snapshot) {
        LobbyMenuHolder holder = new LobbyMenuHolder(LobbyMenuHolder.View.PREVIEW, subject.getUniqueId());
        Inventory inventory = Bukkit.createInventory(holder, 54, MessageCatalog.render(
                config.previewMenuTitle().replace("%player%", subject.getName())));
        holder.attach(inventory);

        if (snapshot.isEmpty()) {
            inventory.setItem(22, Icons.of(Material.BARRIER, "&7Nothing to show",
                    List.of("&8No survival inventory has been recorded yet.")));
            return inventory;
        }

        place(inventory, ItemSerialization.decode(snapshot.contents()), 0);
        place(inventory, ItemSerialization.decode(snapshot.armor()), 45);
        place(inventory, ItemSerialization.decode(snapshot.offhand()), 53);

        inventory.setItem(49, Icons.of(Material.PAPER, "&7Survival inventory", footer(snapshot)));

        return inventory;
    }

    private static void place(Inventory inventory, ItemStack[] items, int offset) {
        if (items == null) {
            return;
        }

        for (int index = 0; index < items.length; index++) {
            int slot = offset + index;

            if (slot >= inventory.getSize() || items[index] == null) {
                continue;
            }

            // Cloned so nothing in this view shares an object with anything real.
            inventory.setItem(slot, items[index].clone());
        }
    }

    private static List<String> footer(InventorySnapshot snapshot) {
        List<String> lore = new ArrayList<>();

        lore.add("&7World: &f" + (snapshot.world() == null ? "unknown" : snapshot.world()));
        lore.add("&7Captured: &f" + age(snapshot.capturedAt()));
        lore.add("");
        lore.add("&8Read-only — nothing here can be taken.");

        return lore;
    }

    private static String age(Long epochMillis) {
        if (epochMillis == null) {
            return "unknown";
        }

        Duration since = Duration.ofMillis(Math.max(0, System.currentTimeMillis() - epochMillis));

        if (since.toDays() > 0) return since.toDays() + "d ago";
        if (since.toHours() > 0) return since.toHours() + "h ago";
        if (since.toMinutes() > 0) return since.toMinutes() + "m ago";
        return "just now";
    }
}
