package org.robtic.minecraft.lobby;

import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Event;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.lobby.gui.LobbyMenuHolder;
import org.robtic.minecraft.lobby.gui.LobbyMenus;
import org.robtic.minecraft.survival.SurvivalCacheService;
import org.robtic.minecraft.survival.friend.FriendTeleportService;
import org.robtic.minecraft.survival.gui.ProfileMenu;

import java.util.Locale;
import java.util.UUID;

/**
 * Every click the lobby handles: the hotbar items, right-clicking a player, and the menus.
 *
 * <h2>Why these live together</h2>
 *
 * They are one interaction surface. A hotbar item opens a menu, a menu button opens another menu or
 * performs an action, and right-clicking a player opens the first of them — splitting that across
 * three listeners would mean three copies of the same lobby-world check and the same cancel.
 */
public final class LobbyMenuListener implements Listener {

    private final Plugin plugin;
    private final LobbyConfiguration config;
    private final LobbyItems items;
    private final LobbyMenus menus;
    private final LobbyPlayerInteraction interaction;
    private final LobbyNotifications notifications;
    private final PlayerVisibilityService visibility;
    private final MessageCatalog messages;
    private final ApiGateway gateway;
    private final SurvivalCacheService cache;
    private final FriendTeleportService friendTeleports;
    private final ProfileMenu profileMenu;

    public LobbyMenuListener(
            Plugin plugin,
            LobbyConfiguration config,
            LobbyItems items,
            LobbyMenus menus,
            LobbyPlayerInteraction interaction,
            LobbyNotifications notifications,
            PlayerVisibilityService visibility,
            MessageCatalog messages,
            ApiGateway gateway,
            SurvivalCacheService cache,
            FriendTeleportService friendTeleports,
            ProfileMenu profileMenu
    ) {
        this.plugin = plugin;
        this.config = config;
        this.items = items;
        this.menus = menus;
        this.interaction = interaction;
        this.notifications = notifications;
        this.visibility = visibility;
        this.messages = messages;
        this.gateway = gateway;
        this.cache = cache;
        this.friendTeleports = friendTeleports;
        this.profileMenu = profileMenu;
    }

    // ─── Hotbar items ─────────────────────────────────────────────────────────────────────────

    /**
     * Opens a lobby item's menu on right-click, anywhere.
     *
     * <h2>Deliberately not `ignoreCancelled`</h2>
     *
     * This ran at NORMAL with `ignoreCancelled = true`, which meant it never fired inside a
     * protected region: WorldGuard cancels {@link PlayerInteractEvent} wherever interaction is
     * denied, and a lobby is exactly the place that is configured. Adventure mode and the lobby's
     * own restrictions cancel it too. The menu is not an interaction with the *world*, so whether
     * the world allows interaction is irrelevant to it — it runs first, and regardless.
     *
     * <h2>Air counts</h2>
     *
     * Both RIGHT_CLICK_AIR and RIGHT_CLICK_BLOCK open the menu, so a player can click anywhere
     * while holding the item rather than having to aim at something.
     */
    @EventHandler(priority = EventPriority.LOWEST)
    public void onUseItem(PlayerInteractEvent event) {
        // Bukkit fires this once per hand. Without the guard a right-click with anything in the
        // off hand opens the menu twice, and the second open lands on the first one's inventory.
        if (event.getHand() != EquipmentSlot.HAND) {
            return;
        }

        Player player = event.getPlayer();

        if (!config.isLobby(player.getWorld().getName())) {
            return;
        }

        Action action = event.getAction();
        if (action != Action.RIGHT_CLICK_AIR && action != Action.RIGHT_CLICK_BLOCK) {
            return;
        }

        // Read from the hand rather than event.getItem(): the two agree, but this is the value the
        // player is actually holding at the moment of the click and needs no null handling.
        ItemStack held = player.getInventory().getItemInMainHand();

        items.identify(held).ifPresent(item -> {
            // Cancelled and both results denied, so the click cannot also place a block, eat, or
            // trigger whatever the item's material would normally do.
            event.setCancelled(true);
            event.setUseItemInHand(Event.Result.DENY);
            event.setUseInteractedBlock(Event.Result.DENY);

            runAction(player, item.action());
        });
    }

    /** The configured action strings, resolved to what they open. */
    private void runAction(Player player, String action) {
        switch (action.toLowerCase(Locale.ROOT)) {
            case "profile" -> openOwnProfile(player);
            case "inventory", "preview" -> openPreview(player);
            case "information", "info" -> player.openInventory(menus.informationMenu());
            case "settings" -> openSettings(player);
            default -> plugin.getLogger().warning("lobby.yml: unknown item action \"" + action + "\"");
        }
    }

    // ─── Right-clicking a player ──────────────────────────────────────────────────────────────

    /**
     * Opens the player menu — inside the lobby only.
     *
     * Outside it the event is left completely alone, so right-clicking somebody in survival behaves
     * exactly as vanilla does.
     *
     * Runs at LOWEST and does not ignore cancelled, for the same reason {@link #onUseItem} does not:
     * WorldGuard cancels entity interaction in a protected region, and the lobby is protected. The
     * menu is not an interaction with the entity, so a region rule about interaction should not
     * decide whether it opens.
     */
    @EventHandler(priority = EventPriority.LOWEST)
    public void onInteractPlayer(PlayerInteractEntityEvent event) {
        // One hand only: otherwise a right-click with something in the off hand opens the menu
        // twice, and the second open replaces the first.
        if (event.getHand() != EquipmentSlot.HAND) {
            return;
        }

        if (!(event.getRightClicked() instanceof Player target)) {
            return;
        }

        Player viewer = event.getPlayer();

        if (!config.isLobby(viewer.getWorld().getName())) {
            return;
        }

        event.setCancelled(true);

        if (interaction.onCooldown(viewer)) {
            return;
        }

        interaction.openPlayerMenu(viewer, target);
    }

    // ─── Menu clicks ──────────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.HIGH)
    public void onMenuClick(InventoryClickEvent event) {
        if (!(event.getInventory().getHolder() instanceof LobbyMenuHolder holder)) {
            return;
        }

        // Cancelled unconditionally, before any dispatch. Every lobby menu is a display: the
        // preview in particular must never let a stack be taken, and doing this first means a new
        // menu added later cannot forget it.
        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        holder.actionAt(event.getRawSlot()).ifPresent(action -> dispatch(player, holder, action, event.getRawSlot()));
    }

    private void dispatch(Player player, LobbyMenuHolder holder, LobbyMenuHolder.Action action, int slot) {
        config.clickSound().ifPresent(sound -> player.playSound(player, sound, 1f, 1f));

        switch (action) {
            case CLOSE -> player.closeInventory();

            case PROFILE -> openProfileOf(player, holder.subject());

            case FRIEND_ADD -> friendAction(player, holder.subject(), "add");
            case FRIEND_REMOVE -> friendAction(player, holder.subject(), "remove");
            case FRIEND_ACCEPT -> friendAction(player, holder.subject(), "accept");
            case FRIEND_DENY -> friendAction(player, holder.subject(), "deny");

            case FRIEND_TELEPORT -> friendTeleport(player, holder.subject());

            case GIVE_ITEM -> openGive(player, holder.subject());
            case GIVE_CONFIRM -> confirmGive(player, holder.subject());
            case GIVE_CANCEL -> player.closeInventory();

            case INFO_ENTRY -> holder.payloadAt(slot).ifPresent(payload -> runInfoAction(player, payload));

            case SETTING_VISIBILITY -> toggleVisibility(player);
            case SETTING_FRIEND_TP -> toggleBoolean(player, "friendTpAutoAccept",
                    !cache.cachedSettings(player.getUniqueId()).friendTpAutoAccept());
            case SETTING_PRIVATE_PROFILE -> toggleBoolean(player, "privateProfile",
                    !cache.cachedSettings(player.getUniqueId()).privateProfile());

            case SETTING_PARTICLES -> {
                player.closeInventory();
                player.performCommand("particle");
            }
            case SETTING_JOIN_MESSAGE -> {
                player.closeInventory();
                player.sendMessage(messages.prefixed("lobby.joinmessage-hint"));
            }
        }
    }

    // ─── Actions ──────────────────────────────────────────────────────────────────────────────

    /** The lobby's profile item — the player's own, so their home locations are included. */
    private void openOwnProfile(Player player) {
        gateway.read(
                () -> new OwnProfile(
                        cache.loadProfile(player.getUniqueId(), true),
                        cache.loadHomes(player.getUniqueId())),
                own -> profileMenu.open(player, own.profile(), own.homes()),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private record OwnProfile(
            org.robtic.minecraft.model.survival.SurvivalModels.Profile profile,
            org.robtic.minecraft.model.survival.SurvivalModels.Homes homes) {
    }

    private void openProfileOf(Player viewer, UUID subject) {
        if (subject == null) {
            return;
        }

        gateway.read(
                () -> cache.refreshProfile(subject, Bukkit.getPlayer(subject) != null),
                // Somebody else's profile: no homes argument, so no locations are shown.
                profile -> profileMenu.open(viewer, profile),
                error -> viewer.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void openPreview(Player player) {
        gateway.read(
                () -> cache.loadInventorySnapshot(player.getUniqueId()),
                snapshot -> player.openInventory(menus.previewMenu(player, snapshot)),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void openSettings(Player player) {
        gateway.read(
                () -> cache.loadSettings(player.getUniqueId()),
                settings -> player.openInventory(menus.settingsMenu(settings)),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void friendAction(Player player, UUID subject, String action) {
        if (subject == null) {
            return;
        }

        Player target = Bukkit.getPlayer(subject);
        String targetName = target != null ? target.getName() : "that player";

        player.closeInventory();

        gateway.read(
                () -> cache.friendAction(player.getUniqueId(), player.getName(), action, subject, targetName),
                outcome -> {
                    player.sendMessage(messages.prefixed(switch (outcome) {
                        case "requested" -> "friend.requested";
                        case "accepted" -> "friend.accepted";
                        case "denied" -> "friend.denied";
                        case "removed" -> "friend.removed";
                        case "cancelled" -> "friend.cancelled";
                        case "already-friends" -> "friend.already";
                        default -> "friend.no-request";
                    }, "player", targetName));

                    // The other side is told too, queued in case they are in a menu of their own.
                    if (target != null && outcome.equals("requested")) {
                        notifications.send(target, "lobby.friend-request-received", "player", player.getName());
                    }
                },
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    /** Routed through the existing friend-teleport service, so the target's preference decides. */
    private void friendTeleport(Player player, UUID subject) {
        player.closeInventory();

        Player target = subject == null ? null : Bukkit.getPlayer(subject);
        if (target == null) {
            player.sendMessage(messages.prefixed("friend.tp-gone"));
            return;
        }

        boolean auto = cache.cachedSettings(target.getUniqueId()).friendTpAutoAccept();

        if (auto) {
            friendTeleports.teleportNow(player, target);
            return;
        }

        friendTeleports.requestTeleport(player, target);
        notifications.send(target, "lobby.teleport-request-received", "player", player.getName());
    }

    private void openGive(Player giver, UUID subject) {
        Player target = subject == null ? null : Bukkit.getPlayer(subject);

        if (target == null) {
            giver.sendMessage(messages.prefixed("lobby.give-target-gone"));
            return;
        }

        var held = giver.getInventory().getItemInMainHand();

        if (held.getType().isAir()) {
            giver.sendMessage(messages.prefixed("lobby.give-nothing-held"));
            return;
        }

        giver.openInventory(menus.giveMenu(giver, target, held));
    }

    private void confirmGive(Player giver, UUID subject) {
        Player target = subject == null ? null : Bukkit.getPlayer(subject);

        giver.closeInventory();

        if (target == null) {
            giver.sendMessage(messages.prefixed("lobby.give-target-gone"));
            return;
        }

        interaction.transfer(giver, target);
    }

    /** The configured information actions: a link, a command, or another menu. */
    private void runInfoAction(Player player, String payload) {
        String[] parts = payload.split("\\|", 2);
        String action = parts[0];
        String value = parts.length > 1 ? parts[1] : "";

        switch (action) {
            case "url" -> {
                player.closeInventory();
                player.sendMessage(messages.prefixed("lobby.link", "url", value));
            }
            case "command" -> {
                player.closeInventory();
                player.performCommand(value);
            }
            case "menu" -> {
                if (value.equalsIgnoreCase("settings")) {
                    openSettings(player);
                } else {
                    player.openInventory(menus.informationMenu());
                }
            }
            case "message" -> {
                player.closeInventory();
                player.sendMessage(MessageCatalog.render(value));
            }
            default -> player.closeInventory();
        }
    }

    // ─── Settings toggles ─────────────────────────────────────────────────────────────────────

    private void toggleVisibility(Player player) {
        gateway.read(
                () -> visibility.toggle(player.getUniqueId()),
                visible -> {
                    visibility.apply(player);
                    player.sendMessage(messages.prefixed(visible ? "lobby.players-shown" : "lobby.players-hidden"));
                    reopenSettings(player);
                },
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void toggleBoolean(Player player, String field, boolean value) {
        JsonObject changes = new JsonObject();
        changes.addProperty(field, value);

        gateway.read(
                () -> cache.updateSettings(player.getUniqueId(), changes),
                updated -> {
                    player.openInventory(menus.settingsMenu(updated));
                    config.clickSound().ifPresent(sound -> player.playSound(player, sound, 1f, 1.2f));
                },
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    /** Re-renders the settings menu so a toggle is reflected without the player reopening it. */
    private void reopenSettings(Player player) {
        player.openInventory(menus.settingsMenu(cache.cachedSettings(player.getUniqueId())));
    }
}
