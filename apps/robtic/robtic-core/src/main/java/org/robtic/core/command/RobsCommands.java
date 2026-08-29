package org.robtic.core.command;

import org.robtic.core.util.Robs;
import com.google.gson.JsonObject;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.api.ApiException;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.service.RobsService;
import org.robtic.core.service.LeaderboardService;
import org.robtic.core.service.PlayerDataService;

import java.util.UUID;
import java.util.logging.Level;

/**
 * `/robs`, and its `/bal` and `/balance` aliases.
 *
 * Grouped for the same reason the staff commands are — three executors that each resolve a player,
 * check the same robs gate and hand off to one service would be three files of identical
 * preamble.
 */
public final class RobsCommands implements CommandExecutor {

    /** Rows `/robs top` prints. Ten fits a chat window without scrolling the conversation away. */
    private static final int TOP_ROWS = 10;

    private final Plugin plugin;
    private final MessageCatalog messages;
    private final ApiGateway gateway;
    private final PlayerDataService players;
    private final RobsService robs;
    private final LeaderboardService leaderboard;

    public RobsCommands(
            Plugin plugin,
            MessageCatalog messages,
            ApiGateway gateway,
            PlayerDataService players,
            RobsService robs,
            LeaderboardService leaderboard
    ) {
        this.plugin = plugin;
        this.messages = messages;
        this.gateway = gateway;
        this.players = players;
        this.robs = robs;
        this.leaderboard = leaderboard;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        // The robs admin forms are handled before the players-only gate, so the console can run
        // them. That is what makes them usable from an NPC or a command block without the player
        // standing in front of it holding the permission themselves — see robsAdminCommand.
        if (isRobsCommand(command.getName()) && args.length > 0 && isAdminAction(args[0])) {
            robsAdminCommand(sender, args);
            return true;
        }

        if (!(sender instanceof Player player)) {
            sender.sendMessage("That command can only be run by a player.");
            return true;
        }

        String name = command.getName().toLowerCase();

        if (isRobsCommand(name)) {
            robsCommand(player, args);
            return true;
        }

        // Anything else is not this executor's command. /link and /unlink belong to
        // RobticDiscord and /exchange to RobticMarket; each registers its own.
        return false;
    }

    /**
     * `/robs`, and its `/bal` and `/balance` shortcuts.
     *
     * Bukkit dispatches an alias through the command it belongs to, so `getName()` is already
     * "robs" for all three. The label is checked anyway so the command keeps working if an operator
     * declares `bal` separately in their own commands.yml.
     */
    private static boolean isRobsCommand(String name) {
        String value = name.toLowerCase();
        return value.equals("robs") || value.equals("bal") || value.equals("balance");
    }

    /**
     * Logs an API failure and picks the message the player sees.
     *
     * Every failure used to surface as "the robs is temporarily unavailable" with nothing in the
     * console, which is indistinguishable from an outage no matter what actually went wrong — a
     * rejected key, a server id the key is not bound to, or a body the API refused. The cause is
     * logged here, once, with the code the API returned, and only a genuinely transient failure is
     * reported to the player as one.
     *
     * @return the message key to send.
     */
    private String reportFailure(String what, String username, ApiException error) {
        if (error.isRetryable()) {
            plugin.getLogger().warning(
                    what + " failed for " + username + ": " + error.code() + " — " + error.getMessage());
            return "robs.unavailable";
        }

        // Not retryable: retrying will fail identically, so this is a configuration fault and is
        // logged loudly enough that an operator finds it without turning debug on.
        plugin.getLogger().log(Level.SEVERE, what + " was rejected by the Robtic API for " + username
                + ": " + error.code() + " (HTTP " + error.status() + ") — " + error.getMessage()
                + ". Check api.yml (url, key, guild-id) and server.id in config.yml against the id "
                + "the key was issued for.");

        return "robs.misconfigured";
    }

    /**
     * `/robs`, `/bal`, `/balance`, and the staff subcommands hanging off them.
     *
     * The admin forms are handled separately, in {@link #robsAdminCommand}, because they must be
     * reachable from the console.
     */
    private void robsCommand(Player player, String[] args) {
        if (args.length == 0) {
            ownBalanceCommand(player);
            return;
        }

        if (args[0].equalsIgnoreCase("top")) {
            topRobsCommand(player);
            return;
        }

        // Anything else with arguments is a typo, not a balance check.
        player.sendMessage(messages.prefixed("robs.admin-usage"));
    }

    /** The subcommands that manage someone else's balance. `give` reads better on a shop NPC. */
    private static boolean isAdminAction(String action) {
        String value = action.toLowerCase();
        return value.equals("add") || value.equals("give") || value.equals("remove") || value.equals("see");
    }

    /**
     * `/robs add|give|remove|see` — managing another player's balance.
     *
     * <h2>Why this takes a CommandSender rather than a Player</h2>
     *
     * So the console can run it, which is what makes it safe to attach to an NPC or a command
     * block. An NPC that runs the command <em>as the player</em> only works if that player holds
     * the permission — and a player who holds it can equally type it themselves, which defeats the
     * point. Running it from the console instead means the permission is never granted to anyone:
     * the console is implicitly permitted, the player is not, and clicking the NPC is the only path
     * to a payout.
     *
     * A player without `robtic.robs.give` is refused here exactly as before, so exposing this to
     * the console does not widen what players can do.
     */
    private void robsAdminCommand(CommandSender sender, String[] args) {
        String action = args[0].toLowerCase();
        if (action.equals("give")) {
            action = "add";
        }

        // ConsoleCommandSender reports true for every permission, so this passes for the console
        // and is a real check for everyone else.
        if (!sender.hasPermission("robtic.robs.give") && !sender.hasPermission("robtic.robs.admin")) {
            sender.sendMessage(messages.prefixed("staff.no-permission"));
            return;
        }

        if (args.length < 2) {
            sender.sendMessage(messages.prefixed("robs.admin-usage"));
            return;
        }

        adminAction(sender, action, args);
    }

    private void adminAction(CommandSender sender, String action, String[] args) {
        String targetName = args[1];

        if (action.equals("see")) {
            gateway.read(
                    () -> {
                        UUID uuid = resolveUuid(targetName);
                        return robs.balance(uuid).robs();
                    },
                    balance -> sender.sendMessage(messages.prefixed(
                            "robs.admin-balance", "player", targetName, "robs", Robs.format(balance))),
                    error -> sender.sendMessage(messages.prefixed(reportFailure("/robs see", targetName, error)))
            );
            return;
        }

        if (args.length < 3) {
            sender.sendMessage(messages.prefixed("robs.admin-usage"));
            return;
        }

        long amount;
        try {
            amount = Long.parseLong(args[2]);
        } catch (NumberFormatException notANumber) {
            sender.sendMessage(messages.prefixed("robs.admin-bad-amount", "value", args[2]));
            return;
        }

        // Compared in hundredths, so an amount that rounds away to nothing — "0.001" — is refused
        // rather than sent as a payment of zero the API would then reject with a less clear message.
        if (!Robs.isPositive(amount)) {
            sender.sendMessage(messages.prefixed("robs.admin-bad-amount", "value", args[2]));
            return;
        }

        boolean credit = action.equals("add");
        String reason = "In-game " + action + " by " + sender.getName();

        gateway.read(
                () -> {
                    UUID uuid = resolveUuid(targetName);
                    return robs.adjust(uuid, targetName, amount, credit, reason);
                },
                balance -> sender.sendMessage(messages.prefixed(
                        credit ? "robs.admin-added" : "robs.admin-removed",
                        "player", targetName, "amount", Robs.format(amount), "robs", Robs.format(balance))),
                error -> sender.sendMessage(messages.prefixed(
                        "INSUFFICIENT_FUNDS".equals(error.code())
                                ? "robs.admin-insufficient"
                                : reportFailure("/robs " + action, targetName, error)))
        );
    }

    /**
     * The uuid behind a name. Off-thread only.
     *
     * An online player answers locally; anyone else is resolved through the API, which can only
     * find them if they are linked — and an unlinked player has no balance to act on anyway.
     */
    private UUID resolveUuid(String username) {
        Player online = plugin.getServer().getPlayerExact(username);
        return online != null ? online.getUniqueId() : players.profileByUsername(username).uuid();
    }

    /** The robs leaderboard, from the cache the placeholder refresh keeps warm. */
    private void topRobsCommand(Player player) {
        var entries = leaderboard.entries();

        if (entries.isEmpty()) {
            player.sendMessage(messages.prefixed("robs.top-empty"));
            return;
        }

        player.sendMessage(messages.prefixed("robs.top-header"));

        // Read straight from memory, so this costs nothing and cannot lag the server however many
        // players run it. It is at most one refresh interval out of date, which a leaderboard can
        // afford in a way a balance cannot.
        for (var entry : entries.subList(0, Math.min(TOP_ROWS, entries.size()))) {
            player.sendMessage(messages.prefixed("robs.top-row",
                    "position", String.valueOf(entry.position()),
                    "player", entry.username(),
                    "robs", Robs.format(entry.robs())));
        }

        leaderboard.forUuid(player.getUniqueId().toString()).ifPresent(mine ->
                player.sendMessage(messages.prefixed("robs.top-you",
                        "position", String.valueOf(mine.position()), "robs", Robs.format(mine.robs()))));
    }

    /** Reads the live balance. Never served from a cache — see {@link RobsService#balance}. */
    private void ownBalanceCommand(Player player) {
        if (!player.hasPermission("robtic.robs")) {
            player.sendMessage(messages.prefixed("robs.locked"));
            return;
        }

        gateway.read(
                () -> robs.balance(player.getUniqueId()),
                balance -> {
                    player.sendMessage(messages.prefixed("robs.balance", "robs", Robs.format(balance.robs())));

                    // Said plainly rather than hidden: the number is real, but the player should
                    // know it has not been confirmed yet if they are about to act on it.
                    if (balance.pending()) {
                        player.sendMessage(messages.prefixed("robs.balance-pending"));
                    } else if (balance.cached()) {
                        player.sendMessage(messages.prefixed("robs.balance-cached"));
                    }
                },
                error -> player.sendMessage(messages.prefixed(
                        "NOT_LINKED".equals(error.code())
                                ? "robs.locked"
                                : reportFailure("/robs", player.getName(), error)))
        );
    }

}
