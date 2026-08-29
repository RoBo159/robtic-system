package org.robtic.minecraft.survival.command;

import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.model.survival.SurvivalModels.BackBudget;
import org.robtic.minecraft.survival.SurvivalCacheService;
import org.robtic.minecraft.survival.TeleportService;

import java.util.Optional;
import java.util.UUID;

/**
 * `/back` — return to where you last teleported from or died, within a premium budget.
 *
 * <h2>The budget is spent from cache, not from the API</h2>
 *
 * The cached budget carries both a remaining count and the moment the window resets. That pair is
 * what makes the design in the specification work:
 *
 * <ul>
 *   <li><b>uses left</b> — teleport, spend one against the API, and store the count it returns;</li>
 *   <li><b>none left, window still open</b> — refuse from memory, with no request at all;</li>
 *   <li><b>none left, window elapsed</b> — the figure is worthless, so re-read it once.</li>
 * </ul>
 *
 * The spend itself still goes to the API, because the budget is network-wide and two servers must
 * not both hand out the last use. What never happens is a request to *ask* whether there is budget.
 */
public final class BackCommand implements CommandExecutor {

    private final ApiGateway gateway;
    private final MessageCatalog messages;
    private final SurvivalCacheService cache;
    private final TeleportService teleports;

    public BackCommand(
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

        UUID uuid = player.getUniqueId();

        // Checked before anything else: with nowhere to return to, the budget is irrelevant and
        // spending a use would be actively wrong.
        Optional<Location> destination = teleports.returnPoint(uuid);
        if (destination.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.back-nowhere"));
            return true;
        }

        gateway.read(
                () -> {
                    BackBudget budget = cache.backBudget(uuid);

                    if (!budget.allowed()) {
                        return budget;
                    }

                    // Refused locally when the window has not rolled over — the case the cache
                    // exists for, and the one that would otherwise be a request per attempt.
                    if (!budget.hasRemaining()) {
                        return budget;
                    }

                    return cache.spendBack(uuid, player.getName());
                },
                budget -> complete(player, budget),
                error -> player.sendMessage(switch (error.code()) {
                    case "FORBIDDEN" -> messages.prefixed("survival.back-not-premium");
                    case "CONFLICT" -> MessageCatalog.render("&c" + error.getMessage());
                    default -> messages.prefixed("survival.unavailable");
                }));

        return true;
    }

    /** Runs on the main thread — the teleport has to. */
    private void complete(Player player, BackBudget budget) {
        if (!budget.allowed()) {
            player.sendMessage(messages.prefixed("survival.back-not-premium"));
            return;
        }

        if (budget.remaining() < 0 || (!budget.hasRemaining() && budget.limit() == 0)) {
            player.sendMessage(messages.prefixed("survival.back-exhausted",
                    "reset", relative(budget.resetAtMillis())));
            return;
        }

        Optional<Location> destination = teleports.takeReturnPoint(player.getUniqueId());
        if (destination.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.back-nowhere"));
            return;
        }

        // Recorded before moving, so a second /back returns to where this one started rather than
        // stranding the player at their death point.
        teleports.remember(player);
        player.teleport(destination.get());

        player.sendMessage(messages.prefixed("survival.back-teleported",
                "remaining", String.valueOf(budget.remaining()),
                "limit", String.valueOf(budget.limit())));
    }

    /** A human interval like "in 3h 12m", for the refusal message. */
    private static String relative(long epochMillis) {
        long remaining = Math.max(0, epochMillis - System.currentTimeMillis());
        long hours = remaining / 3_600_000L;
        long minutes = (remaining % 3_600_000L) / 60_000L;

        if (hours > 0) {
            return hours + "h " + minutes + "m";
        }
        return minutes + "m";
    }
}
