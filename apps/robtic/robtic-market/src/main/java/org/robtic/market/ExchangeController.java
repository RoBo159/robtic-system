package org.robtic.market;

import com.google.gson.JsonObject;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitScheduler;
import org.robtic.core.api.ApiException;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.config.ServerSettings;
import org.robtic.core.model.ItemPrice;
import org.robtic.core.model.PlayerProfile;
import org.robtic.core.service.RobsService;
import org.robtic.core.service.PlayerDataService;
import org.robtic.core.service.PriceService;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Level;

/**
 * Drives the ore exchange.
 *
 * The critical ordering is unchanged from the database-backed version and is now also relied on by
 * the API: items are removed on the main thread **first**, and the credit is requested afterwards
 * for exactly the number of units the removal reported. A failure therefore costs the player the
 * sale rather than paying them for items they still hold.
 *
 * The one thing that changed is what happens when the credit cannot be delivered. It is queued
 * with an idempotency key rather than lost — the items are already gone, so the player is owed
 * those robs whether or not the network is working at that instant.
 */
public final class ExchangeController {

    private final Plugin plugin;
    private final BukkitScheduler scheduler;
    private final ServerSettings server;
    private final MessageCatalog messages;
    private final ExchangeMenu menu;
    private final PriceService prices;
    private final PlayerDataService players;
    private final RobsService robs;

    public ExchangeController(
            Plugin plugin,
            ServerSettings server,
            MessageCatalog messages,
            ExchangeMenu menu,
            PriceService prices,
            PlayerDataService players,
            RobsService robs
    ) {
        this.plugin = plugin;
        this.scheduler = plugin.getServer().getScheduler();
        this.server = server;
        this.messages = messages;
        this.menu = menu;
        this.prices = prices;
        this.players = players;
        this.robs = robs;
    }

    public void openMain(Player player) {
        withProfile(player, profile -> {
            List<ItemPrice> sellable = prices.sellable();
            double balance = robs.balance(player.getUniqueId()).robs();

            scheduler.runTask(plugin, () -> {
                if (!player.isOnline()) {
                    return;
                }

                Map<String, Integer> carried = new HashMap<>();
                for (ItemPrice price : sellable) {
                    carried.put(price.itemKey(), robs.countInInventory(player, price));
                }

                Inventory inventory = menu.buildMain(sellable, carried, balance);
                player.openInventory(inventory);
            });
        });
    }

    public void openItem(Player player, String itemKey) {
        withProfile(player, profile -> {
            Optional<ItemPrice> found = prices.byItemKey(itemKey);
            double balance = robs.balance(player.getUniqueId()).robs();

            scheduler.runTask(plugin, () -> {
                if (!player.isOnline()) {
                    return;
                }

                if (found.isEmpty() || !found.get().enabled()) {
                    player.sendMessage(messages.prefixed("robs.item-unavailable"));
                    return;
                }

                ItemPrice price = found.get();
                int owned = robs.countInInventory(player, price);
                player.openInventory(menu.buildItemView(price, owned, balance));
            });
        });
    }

    public void sellItem(Player player, String itemKey) {
        withProfile(player, profile -> {
            Optional<ItemPrice> found = prices.byItemKey(itemKey);

            if (found.isEmpty() || !found.get().enabled()) {
                scheduler.runTask(plugin, () -> player.sendMessage(messages.prefixed("robs.item-unavailable")));
                return;
            }

            settle(player, List.of(found.get()));
        });
    }

    public void sellEverything(Player player) {
        withProfile(player, profile -> settle(player, prices.sellable()));
    }

    /** Removes on the main thread, then credits on a worker. */
    private void settle(Player player, List<ItemPrice> candidates) {
        scheduler.runTask(plugin, () -> {
            if (!player.isOnline()) {
                return;
            }

            Map<ItemPrice, Integer> removed = new HashMap<>();
            for (ItemPrice price : candidates) {
                int owned = robs.countInInventory(player, price);
                if (owned <= 0) {
                    continue;
                }
                int taken = robs.removeFromInventory(player, price, owned);
                if (taken > 0) {
                    removed.put(price, taken);
                }
            }

            if (removed.isEmpty()) {
                player.sendMessage(messages.prefixed("robs.nothing-to-sell"));
                return;
            }

            player.closeInventory();
            creditAsync(player, removed);
        });
    }

    private void creditAsync(Player player, Map<ItemPrice, Integer> removed) {
        scheduler.runTaskAsynchronously(plugin, () -> {
            try {
                JsonObject result = robs.settle(player.getUniqueId(), player.getName(), removed);

                long credited = result.has("credited") ? result.get("credited").getAsLong() : 0L;
                long balance = result.has("robs") ? result.get("robs").getAsLong() : 0L;

                scheduler.runTask(plugin, () -> {
                    if (!player.isOnline()) {
                        return;
                    }
                    player.sendMessage(messages.prefixed("robs.sale-complete", "robs", org.robtic.core.util.Robs.format(credited)));
                    player.sendMessage(messages.prefixed("robs.balance", "robs", org.robtic.core.util.Robs.format(balance)));
                });
            } catch (ApiException error) {
                // The items are already gone. Dropping the credit here would simply take them, so
                // the request is queued under a stable key, credited to the local cache, and
                // replayed when the API returns — the player is paid now and reconciled later.
                String requestId = ApiGateway.requestIdFor("sell", player.getUniqueId(), System.currentTimeMillis());
                double credited = robs.settleDeferred(player.getUniqueId(), player.getName(), removed, requestId);

                plugin.getLogger().log(Level.WARNING,
                        "Queued a sale for " + player.getName() + " — the API was unreachable", error);

                scheduler.runTask(plugin, () -> {
                    if (!player.isOnline()) {
                        return;
                    }
                    player.sendMessage(messages.prefixed("robs.sale-complete", "robs", org.robtic.core.util.Robs.format(credited)));
                    player.sendMessage(messages.prefixed("robs.sale-queued"));
                });
            }
        });
    }

    /** Runs the action asynchronously with the player's profile, refusing unlinked players. */
    private void withProfile(Player player, java.util.function.Consumer<PlayerProfile> action) {
        scheduler.runTaskAsynchronously(plugin, () -> {
            PlayerProfile profile;

            try {
                profile = players.profile(player.getUniqueId(), player.getName());
            } catch (ApiException error) {
                scheduler.runTask(plugin, () -> player.sendMessage(messages.prefixed("robs.unavailable")));
                return;
            }

            if (!profile.linked() && server.requireLinkForEconomy()) {
                scheduler.runTask(plugin, () -> player.sendMessage(messages.prefixed("robs.locked")));
                return;
            }

            try {
                action.accept(profile);
            } catch (RuntimeException error) {
                plugin.getLogger().log(Level.WARNING, "Exchange action failed for " + player.getName(), error);
                scheduler.runTask(plugin, () -> player.sendMessage(messages.prefixed("robs.unavailable")));
            }
        });
    }
}
