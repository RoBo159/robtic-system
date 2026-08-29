package org.robtic.essentials.afk;

import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.config.MessageCatalog;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.logging.Level;

/**
 * `/afk` and its subcommands.
 *
 * Structured rather than hyphenated: one command with verbs under it, so the whole feature is
 * discoverable from `/afk` alone instead of being spread across `/afk`, `/backfromafk` and
 * `/set-afk-lobby`. `backfromafk` remains only as an alias, because muscle memory outlives naming
 * decisions.
 *
 * <pre>
 *   /afk               go AFK now
 *   /afk back          return to your saved location
 *   /afk setlobby      set the lobby to where you stand   (robtic.afk.admin)
 *   /afk reload        re-read afk.yml                    (robtic.afk.admin)
 *   /afk status        show timeout, lobby and who is AFK (robtic.afk.admin)
 * </pre>
 */
public final class AfkCommands implements CommandExecutor, TabCompleter {

    private static final List<String> ADMIN_VERBS = List.of("back", "setlobby", "reload", "status");

    private final Plugin plugin;
    private final AfkService afk;
    private final MessageCatalog messages;
    private final Runnable reload;

    /**
     * @param reload re-reads afk.yml and swaps the settings in. Injected because the registry that
     *               owns the file belongs to the plugin, not to this command.
     */
    public AfkCommands(Plugin plugin, AfkService afk, MessageCatalog messages, Runnable reload) {
        this.plugin = plugin;
        this.afk = afk;
        this.messages = messages;
        this.reload = reload;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        String verb = args.length == 0 ? "" : args[0].toLowerCase();

        // The alias keeps working, and lands on the same code as `/afk back`.
        if (label.equalsIgnoreCase("backfromafk")) {
            verb = "back";
        }

        switch (verb) {
            case "setlobby" -> setLobby(sender);
            case "reload" -> reloadCommand(sender);
            case "status" -> status(sender);
            case "back" -> back(sender);
            case "" -> enter(sender);
            default -> sender.sendMessage(messages.prefixed("afk.usage"));
        }

        return true;
    }

    private void enter(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only a player can go AFK.");
            return;
        }

        if (afk.isAfk(player.getUniqueId())) {
            player.sendMessage(messages.prefixed("afk.already"));
            return;
        }

        afk.enter(player, true);
    }

    private void back(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only a player can return from AFK.");
            return;
        }

        if (!afk.leave(player)) {
            player.sendMessage(messages.prefixed("afk.not-afk"));
        }
    }

    /** Writes the lobby to afk.yml at the sender's feet, the same way `/jail set` works. */
    private void setLobby(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Stand where you want the lobby and run this in game.");
            return;
        }

        if (!player.hasPermission("robtic.afk.admin")) {
            player.sendMessage(messages.prefixed("staff.no-permission"));
            return;
        }

        Location where = player.getLocation();
        var config = afk.settings().raw();

        config.set("afk.lobby.world", where.getWorld().getName());
        config.set("afk.lobby.x", where.getX());
        config.set("afk.lobby.y", where.getY());
        config.set("afk.lobby.z", where.getZ());
        config.set("afk.lobby.yaw", where.getYaw());
        config.set("afk.lobby.pitch", where.getPitch());

        try {
            config.save(new File(plugin.getDataFolder(), "afk.yml"));
            player.sendMessage(messages.prefixed("afk.lobby-set"));
        } catch (IOException error) {
            plugin.getLogger().log(Level.WARNING, "Could not save the AFK lobby", error);
            player.sendMessage(messages.prefixed("afk.lobby-save-failed"));
        }
    }

    private void reloadCommand(CommandSender sender) {
        if (!sender.hasPermission("robtic.afk.admin")) {
            sender.sendMessage(messages.prefixed("staff.no-permission"));
            return;
        }

        reload.run();
        sender.sendMessage(messages.prefixed("afk.reloaded"));
    }

    /**
     * What an operator needs to answer "why is nobody going AFK?".
     *
     * Names the three things that actually cause it — the feature being off, no lobby set, or a
     * timeout longer than anyone has been idle — rather than only reporting the count.
     */
    private void status(CommandSender sender) {
        if (!sender.hasPermission("robtic.afk.admin")) {
            sender.sendMessage(messages.prefixed("staff.no-permission"));
            return;
        }

        AfkSettings settings = afk.settings();

        // The resolved destination rather than the configured lobby: those differ whenever `world`
        // is doing the work, and reporting the setting instead of the outcome is how "AFK is
        // configured but nobody is being moved" stays unexplained.
        Location destination = settings.destination();

        sender.sendMessage(messages.prefixed("afk.status-enabled",
                "value", String.valueOf(settings.enabled())));
        sender.sendMessage(messages.prefixed("afk.status-timeout",
                "seconds", String.valueOf(settings.timeoutMillis() / 1000)));
        sender.sendMessage(messages.prefixed("afk.status-lobby",
                "value", destination == null
                        ? (settings.worldName().isBlank()
                                ? "not set"
                                : "world \"" + settings.worldName() + "\" is not loaded")
                        : destination.getWorld().getName() + " " + Math.round(destination.getX())
                          + ", " + Math.round(destination.getY()) + ", " + Math.round(destination.getZ())));
        sender.sendMessage(messages.prefixed("afk.status-rewards",
                "value", settings.rewardsEnabled()
                        ? settings.robsPerHour() + " robs/hour"
                        : "disabled"));
        sender.sendMessage(messages.prefixed("afk.status-hiding",
                "value", String.valueOf(settings.hidePlayers())));
        sender.sendMessage(messages.prefixed("afk.status-count",
                "count", String.valueOf(afk.afkCount())));
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (args.length != 1) {
            return List.of();
        }

        String prefix = args[0].toLowerCase();
        return ADMIN_VERBS.stream().filter(verb -> verb.startsWith(prefix)).toList();
    }
}
