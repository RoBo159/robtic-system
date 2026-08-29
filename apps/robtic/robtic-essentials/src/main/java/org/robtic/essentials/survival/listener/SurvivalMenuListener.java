package org.robtic.essentials.survival.listener;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.mail.MailboxService;
import org.robtic.essentials.model.SurvivalModels.Home;
import org.robtic.essentials.model.SurvivalModels.Homes;
import org.robtic.essentials.survival.SurvivalCacheService;
import org.robtic.essentials.survival.TeleportService;
import org.robtic.essentials.survival.cosmetic.CosmeticCommands;
import org.robtic.essentials.survival.friend.FriendCommands;
import org.robtic.essentials.survival.friend.FriendTeleportService;
import org.robtic.essentials.survival.gui.ProfileMenu;
import org.robtic.essentials.survival.gui.SurvivalMenuHolder;

import java.util.Optional;
import java.util.UUID;

/**
 * Handles clicks in every survival menu.
 *
 * One listener for all of them, dispatching on the holder's view. Each menu having its own listener
 * would mean four registrations that all begin with the same holder check and cancel — and one of
 * them eventually forgetting the cancel, which is how items get stolen out of a GUI.
 */
public final class SurvivalMenuListener implements Listener {

    private final MessageCatalog messages;
    private final SurvivalCacheService cache;
    private final TeleportService teleports;
    private final FriendTeleportService friendTeleports;
    private final FriendCommands friendCommands;
    private final CosmeticCommands cosmetics;
    /** Null when RobticMail is not installed. The profile then binds no mailbox button at all. */
    private final MailboxService mailbox;

    public SurvivalMenuListener(
            MessageCatalog messages,
            SurvivalCacheService cache,
            TeleportService teleports,
            FriendTeleportService friendTeleports,
            FriendCommands friendCommands,
            CosmeticCommands cosmetics,
            MailboxService mailbox
    ) {
        this.messages = messages;
        this.cache = cache;
        this.teleports = teleports;
        this.friendTeleports = friendTeleports;
        this.friendCommands = friendCommands;
        this.cosmetics = cosmetics;
        this.mailbox = mailbox;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getInventory().getHolder() instanceof SurvivalMenuHolder<?> holder)) {
            return;
        }

        // Cancelled before anything else: these are display inventories and nothing in them may be
        // picked up, whichever menu it is and whether or not the slot means anything.
        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        Optional<?> payload = holder.at(event.getRawSlot());
        if (payload.isEmpty()) {
            return;
        }

        switch (holder.view()) {
            case HOMES -> teleportHome(player, String.valueOf(payload.get()));
            case FRIENDS -> friendClicked(player, payload.get());
            case FRIEND_SETTINGS -> {
                player.closeInventory();
                friendCommands.setAutoAccept(player, Boolean.TRUE.equals(payload.get()));
            }
            case PARTICLES -> particleClicked(player, String.valueOf(payload.get()));
            case PROFILE -> profileClicked(player, String.valueOf(payload.get()));
            default -> {
                // FRIEND_REQUESTS is a read-only view.
            }
        }
    }

    /**
     * The profile is read-only apart from the mailbox button, which is bound only on a player's own
     * profile — so there is no slot here that could act on somebody else's mail.
     */
    private void profileClicked(Player player, String action) {
        if (!ProfileMenu.MAIL_ACTION.equals(action)) {
            return;
        }

        if (mailbox == null) {
            return;
        }

        player.closeInventory();
        mailbox.open(player);
    }

    private void teleportHome(Player player, String name) {
        player.closeInventory();

        Optional<Homes> homes = cache.cachedHomes(player.getUniqueId());
        if (homes.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.unavailable"));
            return;
        }

        Optional<Home> home = homes.get().byName(name);
        if (home.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.home-missing", "name", name, "names", ""));
            return;
        }

        teleports.teleport(player, home.get().location(), "survival.home-teleported", "name", name);
    }

    /**
     * Clicking a friend's head requests a teleport to them.
     *
     * Their preference still decides whether it happens immediately or asks — the menu is another
     * way to run `/friend tp`, not a way around the setting.
     */
    private void friendClicked(Player player, Object payload) {
        if (!(payload instanceof UUID uuid)) {
            return;
        }

        player.closeInventory();

        Player target = Bukkit.getPlayer(uuid);
        if (target == null) {
            player.sendMessage(messages.prefixed("friend.not-online", "player", "That friend"));
            return;
        }

        boolean auto = cache.cachedFriends(uuid)
                .map(friends -> friends.autoAcceptTp())
                .orElse(false);

        if (auto) {
            friendTeleports.teleportNow(player, target);
        } else {
            friendTeleports.requestTeleport(player, target);
        }
    }

    private void particleClicked(Player player, String particle) {
        player.closeInventory();

        if (particle.equals("OFF")) {
            cosmetics.clearParticle(player);
            return;
        }

        cosmetics.select(player, particle);
    }
}
