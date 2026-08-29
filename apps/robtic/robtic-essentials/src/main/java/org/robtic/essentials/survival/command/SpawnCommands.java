package org.robtic.essentials.survival.command;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.essentials.model.SurvivalModels.StoredLocation;
import org.robtic.essentials.survival.SurvivalCacheService;
import org.robtic.essentials.survival.TeleportService;

/**
 * `/spawn` and `/setspawn`.
 *
 * `/spawn` is the clearest illustration of the cache-first rule in the whole plugin: the spawn
 * point is loaded once at boot and changes only when `/setspawn` runs, so the command a hundred
 * players use costs no request at all and works during an outage.
 */
public final class SpawnCommands implements CommandExecutor {

    private final ApiGateway gateway;
    private final MessageCatalog messages;
    private final SurvivalCacheService cache;
    private final TeleportService teleports;

    public SpawnCommands(
            ApiGateway gateway,
            MessageCatalog messages,
            SurvivalCacheService cache,
            TeleportService teleports
    ) {
        this.gateway = gateway;
        this.messages = messages;
        this.cache = cache;
        this.teleports = teleports;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("That command can only be run by a player.");
            return true;
        }

        switch (command.getName().toLowerCase()) {
            case "spawn" -> spawn(player);
            case "setspawn" -> setSpawn(player);
            default -> {
                return false;
            }
        }

        return true;
    }

    /** Served entirely from memory — no API call, no waiting, works offline. */
    private void spawn(Player player) {
        if (!player.hasPermission("robtic.spawn")) {
            player.sendMessage(messages.prefixed("staff.no-permission"));
            return;
        }

        cache.spawn().ifPresentOrElse(
                location -> teleports.teleport(player, location, "survival.spawn-teleported"),
                () -> player.sendMessage(messages.prefixed("survival.spawn-unset")));
    }

    private void setSpawn(Player player) {
        if (!player.hasPermission("robtic.spawn.set")) {
            player.sendMessage(messages.prefixed("staff.no-permission"));
            return;
        }

        StoredLocation here = StoredLocation.of(player.getLocation());

        gateway.read(
                () -> cache.setSpawn(player.getUniqueId(), player.getName(), here),
                saved -> player.sendMessage(messages.prefixed("survival.spawn-set")),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }
}
