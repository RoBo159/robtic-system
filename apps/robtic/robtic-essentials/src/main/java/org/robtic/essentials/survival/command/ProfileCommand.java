package org.robtic.essentials.survival.command;

import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.essentials.survival.SurvivalCacheService;
import org.robtic.essentials.survival.gui.ProfileMenu;

import java.util.UUID;

/**
 * `/profile [player]`.
 *
 * Own profile comes from the cache when warm; another player's is always re-read, because asking
 * about somebody else is an explicit request for their current state and a ten-minute-old answer
 * would be the wrong one.
 */
public final class ProfileCommand implements CommandExecutor {

    private final ApiGateway gateway;
    private final MessageCatalog messages;
    private final SurvivalCacheService cache;
    private final ProfileMenu menu;

    public ProfileCommand(
            ApiGateway gateway,
            MessageCatalog messages,
            SurvivalCacheService cache,
            ProfileMenu menu
    ) {
        this.gateway = gateway;
        this.messages = messages;
        this.cache = cache;
        this.menu = menu;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("That command can only be run by a player.");
            return true;
        }

        if (args.length == 0) {
            own(player);
            return true;
        }

        other(player, args[0]);
        return true;
    }

    /**
     * The caller's own profile, which includes their home locations.
     *
     * The homes come from the local cache alongside the profile, never from the profile response —
     * see {@link ProfileMenu}. Loaded in the same off-thread pass so the menu opens once, complete.
     */
    private void own(Player player) {
        gateway.read(
                () -> new OwnProfile(
                        cache.loadProfile(player.getUniqueId(), true),
                        cache.loadHomes(player.getUniqueId())),
                own -> menu.open(player, own.profile(), own.homes()),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    /** A profile together with the viewer's own homes. */
    private record OwnProfile(
            org.robtic.essentials.model.SurvivalModels.Profile profile,
            org.robtic.essentials.model.SurvivalModels.Homes homes) {
    }

    /**
     * Another player's profile.
     *
     * Only resolves an online player, for the same reason `/friend add` does: turning an arbitrary
     * name into a UUID would need a Mojang lookup this plugin has no business making.
     */
    private void other(Player viewer, String name) {
        Player target = Bukkit.getPlayerExact(name);

        if (target == null) {
            viewer.sendMessage(messages.prefixed("friend.not-online", "player", name));
            return;
        }

        UUID uuid = target.getUniqueId();

        gateway.read(
                () -> cache.refreshProfile(uuid, true),
                // No homes argument: this is somebody else's profile.
                profile -> menu.open(viewer, profile),
                error -> viewer.sendMessage(messages.prefixed("survival.unavailable")));
    }
}
