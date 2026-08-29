package org.robtic.staff;

import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.config.MessageCatalog;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * `/fly` — toggles flight, for yourself or for somebody else.
 *
 * <pre>
 *   /fly              toggle your own flight
 *   /fly &lt;player&gt;     toggle theirs        (robtic.staff.fly.others)
 * </pre>
 *
 * <h2>Flight is granted, not remembered</h2>
 *
 * Nothing here persists. Bukkit resets {@code allowFlight} on respawn and on some gamemode changes,
 * and a plugin that tried to restore it afterwards would be fighting the server over a piece of
 * state the server considers its own — the usual result being a player who cannot fly and cannot
 * work out why. Re-running the command is one keystroke; a resurrection system that is wrong a
 * fraction of the time is not worth it.
 *
 * <h2>Creative already flies</h2>
 *
 * A creative or spectator player has flight from the gamemode, and turning "off" what the gamemode
 * grants would drop them out of the sky and then be undone by the next gamemode refresh. Those modes
 * are therefore refused with an explanation rather than silently doing nothing.
 */
public final class FlightCommand implements CommandExecutor, TabCompleter {

    private final MessageCatalog messages;

    public FlightCommand(MessageCatalog messages) {
        this.messages = messages;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {
        if (args.length == 0) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage("Only a player can fly. Try /fly <player>.");
                return true;
            }

            toggle(sender, player, true);
            return true;
        }

        if (!sender.hasPermission("robtic.staff.fly.others")) {
            sender.sendMessage(messages.prefixed("staff.no-permission"));
            return true;
        }

        Player target = Bukkit.getPlayerExact(args[0]);
        if (target == null) {
            sender.sendMessage(messages.prefixed("staff.target-offline"));
            return true;
        }

        toggle(sender, target, sender.equals(target));
        return true;
    }

    private void toggle(CommandSender sender, Player target, boolean self) {
        GameMode mode = target.getGameMode();

        if (mode == GameMode.CREATIVE || mode == GameMode.SPECTATOR) {
            sender.sendMessage(messages.prefixed("fly.gamemode-flies",
                    "player", target.getName(),
                    "mode", mode.name().toLowerCase(Locale.ROOT)));
            return;
        }

        boolean enabled = !target.getAllowFlight();
        target.setAllowFlight(enabled);

        if (enabled) {
            target.setFlying(true);
        }
        // Not set to false on disable: the player may be mid-air, and dropping them from wherever
        // they are hovering is how a toggle becomes fall damage. Clearing allowFlight is enough —
        // the client falls under its own gravity, which is survivable and expected.

        target.sendMessage(messages.prefixed(enabled ? "fly.enabled" : "fly.disabled"));

        if (!self) {
            sender.sendMessage(messages.prefixed(enabled ? "fly.enabled-other" : "fly.disabled-other",
                    "player", target.getName()));
        }
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                      @NotNull String label, String[] args) {
        if (args.length != 1 || !sender.hasPermission("robtic.staff.fly.others")) {
            return List.of();
        }

        String prefix = args[0].toLowerCase(Locale.ROOT);
        List<String> names = new ArrayList<>();

        for (Player online : Bukkit.getOnlinePlayers()) {
            if (online.getName().toLowerCase(Locale.ROOT).startsWith(prefix)) {
                names.add(online.getName());
            }
        }

        return names;
    }
}
