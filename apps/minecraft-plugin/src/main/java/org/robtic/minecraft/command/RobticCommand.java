package org.robtic.minecraft.command;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.plugin.Plugin;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ConfigRegistry;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.model.ItemPrice;
import org.robtic.minecraft.service.PriceService;
import org.robtic.minecraft.service.StatusService;

import java.util.List;

/**
 * `/robtic` — operator commands for the integration itself.
 *
 * `reload` re-reads every configuration file, which is also how an API key rotation takes effect:
 * the key is read from `api.yml` on each request, so replacing it and reloading is enough and no
 * server restart is needed.
 */
public final class RobticCommand implements CommandExecutor, TabCompleter {

    private static final List<String> SUBCOMMANDS = List.of("status", "prices", "reload", "queue", "refresh");

    private final Plugin plugin;
    private final ConfigRegistry config;
    private final ApiGateway gateway;
    private final PriceService prices;
    private final StatusService status;

    public RobticCommand(
            Plugin plugin,
            ConfigRegistry config,
            ApiGateway gateway,
            PriceService prices,
            StatusService status
    ) {
        this.plugin = plugin;
        this.config = config;
        this.gateway = gateway;
        this.prices = prices;
        this.status = status;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        MessageCatalog messages = config.messages();

        if (args.length == 0) {
            sender.sendMessage(messages.component("admin.usage"));
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "reload" -> {
                config.reload();
                prices.invalidate();
                // Republished, not just re-read: the bot acts on what was last pushed, so a
                // reload that kept it to itself would look like the edit had no effect.
                if (plugin instanceof org.robtic.minecraft.RobticMinecraftPlugin robtic) {
                    robtic.pushConfiguration();
                }
                sender.sendMessage(messages.component("admin.reloaded"));
            }

            case "refresh" -> {
                prices.invalidate();
                sender.sendMessage(messages.component("admin.cache-cleared"));
            }

            case "queue" -> sender.sendMessage(messages.component("admin.queue-size",
                    "count", String.valueOf(gateway.queue().size()),
                    "state", gateway.isAvailable() ? "online" : "offline"));

            case "status" -> plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
                try {
                    status.reportHeartbeat();
                    sender.sendMessage(messages.component("admin.status-reported"));
                } catch (RuntimeException error) {
                    sender.sendMessage(messages.component("admin.status-failed"));
                }
            });

            case "prices" -> plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
                try {
                    List<ItemPrice> sellable = prices.sellable();

                    if (sellable.isEmpty()) {
                        sender.sendMessage(messages.component("admin.no-prices"));
                        return;
                    }

                    sender.sendMessage(messages.component("admin.price-header"));
                    for (ItemPrice price : sellable) {
                        sender.sendMessage(messages.component("admin.price-entry",
                                "item", price.displayName(), "price", org.robtic.minecraft.util.Robs.format(price.price())));
                    }
                } catch (ApiException error) {
                    sender.sendMessage(messages.component("admin.price-failed"));
                }
            });

            default -> sender.sendMessage(messages.component("admin.usage"));
        }

        return true;
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (args.length != 1) {
            return List.of();
        }
        return SUBCOMMANDS.stream().filter(name -> name.startsWith(args[0].toLowerCase())).toList();
    }
}
