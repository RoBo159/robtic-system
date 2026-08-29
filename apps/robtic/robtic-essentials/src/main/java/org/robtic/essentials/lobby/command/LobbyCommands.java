package org.robtic.essentials.lobby.command;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.essentials.lobby.LobbyConfiguration;
import org.robtic.essentials.lobby.PlayerVisibilityService;
import org.robtic.essentials.lobby.gui.LobbyMenus;
import org.robtic.essentials.survival.SurvivalCacheService;

/**
 * `/players` and `/settings` — the two lobby commands with no menu entry point of their own.
 *
 * Everything else the lobby offers hangs off a hotbar item or a right-click, but these two are
 * things a player reaches for by name.
 */
public final class LobbyCommands implements CommandExecutor {

    private final ApiGateway gateway;
    private final MessageCatalog messages;
    private final LobbyConfiguration config;
    private final SurvivalCacheService cache;
    private final PlayerVisibilityService visibility;
    private final LobbyMenus menus;

    public LobbyCommands(
            ApiGateway gateway,
            MessageCatalog messages,
            LobbyConfiguration config,
            SurvivalCacheService cache,
            PlayerVisibilityService visibility,
            LobbyMenus menus
    ) {
        this.gateway = gateway;
        this.messages = messages;
        this.config = config;
        this.cache = cache;
        this.visibility = visibility;
        this.menus = menus;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("That command can only be run by a player.");
            return true;
        }

        switch (command.getName().toLowerCase()) {
            case "players" -> togglePlayers(player);
            case "settings" -> openSettings(player);
            default -> {
                return false;
            }
        }

        return true;
    }

    /**
     * Toggles whether other players are rendered.
     *
     * The setting is stored network-wide but only *applied* in the lobby — hiding players in
     * survival would hide the people a player is building with.
     */
    private void togglePlayers(Player player) {
        gateway.read(
                () -> visibility.toggle(player.getUniqueId()),
                visible -> {
                    visibility.apply(player);

                    player.sendMessage(messages.prefixed(visible ? "lobby.players-shown" : "lobby.players-hidden"));

                    if (!config.isLobby(player.getWorld().getName())) {
                        // Saved, but with nothing to show for it here — said plainly rather than
                        // leaving the player wondering why nothing changed.
                        player.sendMessage(messages.prefixed("lobby.players-lobby-only"));
                    }
                },
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void openSettings(Player player) {
        gateway.read(
                () -> cache.loadSettings(player.getUniqueId()),
                settings -> player.openInventory(menus.settingsMenu(settings)),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }
}
