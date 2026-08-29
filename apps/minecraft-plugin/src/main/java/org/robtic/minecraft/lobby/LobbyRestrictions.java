package org.robtic.minecraft.lobby;

import org.bukkit.GameMode;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.Cancellable;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.FoodLevelChangeEvent;
import org.bukkit.event.inventory.CraftItemEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.inventory.InventoryType;
import org.bukkit.event.player.PlayerArmorStandManipulateEvent;
import org.bukkit.event.player.PlayerBucketEmptyEvent;
import org.bukkit.event.player.PlayerBucketFillEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerFishEvent;
import org.bukkit.event.player.PlayerItemDamageEvent;
import org.bukkit.event.player.PlayerPickupArrowEvent;
import org.bukkit.event.player.PlayerSwapHandItemsEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.player.PlayerExpChangeEvent;
import org.bukkit.event.vehicle.VehicleEnterEvent;
import org.robtic.minecraft.config.MessageCatalog;

import java.util.Locale;
import java.util.Set;

/**
 * Everything a player may not do in the lobby.
 *
 * <h2>One listener, one guard</h2>
 *
 * Every handler is the same three lines: is this the lobby, is this restriction enabled, cancel.
 * Splitting them across several listeners would repeat that guard a dozen times and make it easy
 * for one handler to forget the world check and start cancelling events in survival — which is by
 * far the worst failure mode available here.
 *
 * <h2>Bypass</h2>
 *
 * `robtic.lobby.bypass` exempts a player entirely, so an administrator can build the lobby without
 * turning the module off. Creative and spectator mode are exempt for the same reason.
 *
 * <h2>What is deliberately allowed</h2>
 *
 * Walking, jumping, chatting, opening menus, right-clicking players and using the lobby items. The
 * restriction set is configured in lobby.yml, so an operator can permit more for an event without
 * touching this class.
 */
public final class LobbyRestrictions implements Listener {

    /** Inventory views a player may legitimately have open in the lobby: our own menus. */
    private static final Set<InventoryType> MENU_TYPES = Set.of(InventoryType.CHEST, InventoryType.HOPPER);

    private final LobbyConfiguration config;
    private final LobbyItems items;
    private final MessageCatalog messages;

    public LobbyRestrictions(LobbyConfiguration config, LobbyItems items, MessageCatalog messages) {
        this.config = config;
        this.items = items;
        this.messages = messages;
    }

    // ─── Blocks ───────────────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        deny(event, event.getPlayer(), "block-break", "lobby.denied-build");
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        deny(event, event.getPlayer(), "block-place", "lobby.denied-build");
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onBucketFill(PlayerBucketFillEvent event) {
        deny(event, event.getPlayer(), "buckets", "lobby.denied-build");
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onBucketEmpty(PlayerBucketEmptyEvent event) {
        deny(event, event.getPlayer(), "buckets", "lobby.denied-build");
    }

    // ─── Items ────────────────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        deny(event, event.getPlayer(), "item-drop", "lobby.denied-drop");
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (event.getEntity() instanceof Player player) {
            deny(event, player, "item-pickup", null);
        }
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onArrowPickup(PlayerPickupArrowEvent event) {
        deny(event, event.getPlayer(), "item-pickup", null);
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onSwapHands(PlayerSwapHandItemsEvent event) {
        deny(event, event.getPlayer(), "offhand-swap", null);
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onItemDamage(PlayerItemDamageEvent event) {
        // Lobby items must not wear out — they are furniture, not equipment.
        deny(event, event.getPlayer(), "item-damage", null);
    }

    // ─── Inventory ────────────────────────────────────────────────────────────────────────────

    /**
     * Blocks moving anything in the player's own inventory, while leaving our menus clickable.
     *
     * The distinction matters: cancelling every click would make the lobby menus dead, and
     * cancelling none would let a player drag the profile head out of their hotbar. So a click in
     * one of our menu views is left to that menu's own handler, and anything touching the player's
     * inventory is refused.
     */
    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player) || exempt(player)) {
            return;
        }

        // The world check every other handler gets from `deny`. Without it this one restriction
        // applied everywhere: the top inventory of a player who has no container open is their
        // crafting grid, which is neither a chest nor a hopper, so the guard below fell through and
        // cancelled the click — leaving survival players unable to move anything in their own
        // inventory, or to use a furnace, anvil or crafting table, in any world on the server.
        if (!config.isLobby(player.getWorld().getName()) || !config.restricts("inventory-move")) {
            return;
        }

        // Our menus are chest-shaped and carry their own holder; their listeners cancel as needed.
        if (MENU_TYPES.contains(event.getInventory().getType()) && event.getInventory().getHolder() != null) {
            return;
        }

        // A lobby item is never movable, wherever it was clicked from.
        if (items.isLobbyItem(event.getCurrentItem()) || items.isLobbyItem(event.getCursor())) {
            event.setCancelled(true);
            return;
        }

        event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onDrag(InventoryDragEvent event) {
        if (event.getWhoClicked() instanceof Player player) {
            deny(event, player, "inventory-move", null);
        }
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onCraft(CraftItemEvent event) {
        if (event.getWhoClicked() instanceof Player player) {
            deny(event, player, "crafting", "lobby.denied-generic");
        }
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onArmorStand(PlayerArmorStandManipulateEvent event) {
        deny(event, event.getPlayer(), "armor-swap", null);
    }

    // ─── Damage, hunger and experience ────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (event.getEntity() instanceof Player player) {
            deny(event, player, "damage", null);
        }
    }

    /**
     * PVP, checked from the attacker's side as well.
     *
     * The damage handler above already covers the victim, but an attacker in the lobby hitting
     * somebody who is not — possible across a portal boundary for a tick — should also be stopped,
     * and this is the only place that sees who swung.
     */
    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onPvp(EntityDamageByEntityEvent event) {
        Entity damager = event.getDamager();

        if (damager instanceof Player attacker && !exempt(attacker)
                && config.isLobby(attacker.getWorld().getName()) && config.restricts("pvp")) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onHunger(FoodLevelChangeEvent event) {
        if (event.getEntity() instanceof Player player) {
            deny(event, player, "hunger", null);
        }
    }

    @EventHandler(priority = EventPriority.LOW)
    public void onExperience(PlayerExpChangeEvent event) {
        Player player = event.getPlayer();

        if (!exempt(player) && config.isLobby(player.getWorld().getName()) && config.restricts("experience")) {
            // Not cancellable — the amount is simply zeroed.
            event.setAmount(0);
        }
    }

    // ─── World interaction ────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onFish(PlayerFishEvent event) {
        deny(event, event.getPlayer(), "fishing", null);
    }

    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onVehicle(VehicleEnterEvent event) {
        if (event.getEntered() instanceof Player player) {
            deny(event, player, "vehicles", null);
        }
    }

    // ─── Commands ─────────────────────────────────────────────────────────────────────────────

    /**
     * Restricts the lobby to its configured command list.
     *
     * An empty list disables the filter entirely rather than blocking everything, so the feature is
     * opt-in — an operator who has not configured it does not discover their lobby has silently
     * banned every command.
     */
    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        Player player = event.getPlayer();

        if (exempt(player) || !config.isLobby(player.getWorld().getName())) {
            return;
        }

        String label = event.getMessage().substring(1).split(" ")[0].toLowerCase(Locale.ROOT);

        // Namespaced form, e.g. /minecraft:me — resolved to the plain label so the list cannot be
        // sidestepped by typing the qualified name.
        int namespace = label.indexOf(':');
        if (namespace >= 0) {
            label = label.substring(namespace + 1);
        }

        if (config.commandAllowed(label)) {
            return;
        }

        event.setCancelled(true);
        player.sendMessage(messages.prefixed("lobby.denied-command"));
    }

    // ─── Shared guard ─────────────────────────────────────────────────────────────────────────

    /**
     * The one check every handler above delegates to.
     *
     * @param key       the restriction's name in lobby.yml
     * @param messageKey a message to send, or null when silence is better — refusing an item pickup
     *                   twenty times as somebody walks over a pile should not produce twenty lines
     */
    private void deny(Cancellable event, Player player, String key, String messageKey) {
        if (exempt(player) || !config.isLobby(player.getWorld().getName()) || !config.restricts(key)) {
            return;
        }

        event.setCancelled(true);

        if (messageKey != null) {
            player.sendMessage(messages.prefixed(messageKey));
        }
    }

    /** Administrators and creative-mode players are outside the restrictions entirely. */
    private static boolean exempt(Player player) {
        return player.hasPermission("robtic.lobby.bypass")
                || player.getGameMode() == GameMode.CREATIVE
                || player.getGameMode() == GameMode.SPECTATOR;
    }
}
