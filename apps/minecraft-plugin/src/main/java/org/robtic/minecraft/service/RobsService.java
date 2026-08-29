package org.robtic.minecraft.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.cache.BalanceCache;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.model.ItemPrice;
import org.robtic.minecraft.util.Robs;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * **Robs** — the Minecraft currency, over the API.
 *
 * Robs are keyed by Minecraft UUID and have nothing to do with Discord coins: a separate balance in
 * a separate collection, never converted into one another. Nothing in this class asks whether the
 * player has linked Discord, because an unlinked player has a working wallet like anyone else.
 *
 * The sell path keeps the ordering the old implementation established and the API depends on:
 * items are removed on the main thread **first**, then the credit is requested for exactly the
 * number of units the removal reported. A failure therefore costs the player the sale rather than
 * paying them twice — and because the credit carries an idempotency key, a request that is queued
 * during an outage and replayed later still credits exactly once.
 */
public final class RobsService {

    private final ApiClient client;
    private final ApiGateway gateway;
    private final ApiSettings settings;
    private final BalanceCache balances;

    public RobsService(ApiClient client, ApiGateway gateway, ApiSettings settings, BalanceCache balances) {
        this.client = client;
        this.gateway = gateway;
        this.settings = settings;
        this.balances = balances;
    }

    /**
     * The player's balance, from the API when it is reachable and from cache when it is not.
     *
     * The cached figure is the last confirmed balance plus anything sold since whose credit is
     * still queued, so a player who mines and sells through an outage watches their robs go up
     * exactly as they would normally. Both halves are reconciled against the API on reconnect.
     *
     * Must run off the main thread.
     */
    public Balance balance(UUID uuid) {
        try {
            JsonObject response = client.get(
                    "/api/robs/balance/" + uuid,
                    Map.of("guildId", settings.guildId())
            );

            double robs = response.has("robs") ? Robs.round(response.get("robs").getAsDouble()) : 0d;

            // Authoritative. Any pending credit is already inside this number, because the queued
            // requests are what produced it — so it is dropped rather than added again.
            balances.reconcile(uuid, robs);
            return new Balance(robs, false, false);
        } catch (ApiException error) {
            if (!settings.serveCachedBalances()) {
                throw error;
            }

            return balances.get(uuid)
                    .map(cached -> new Balance(cached.total(), true, cached.hasPending()))
                    .orElseThrow(() -> error);
        }
    }

    /**
     * A balance reading together with how much to trust it.
     *
     * @param robs     the figure to show the player
     * @param cached   true when it came from cache rather than the API
     * @param pending  true when part of it is a credit the API has not yet acknowledged
     */
    public record Balance(double robs, boolean cached, boolean pending) {
    }

    /**
     * Credits or debits a player's balance directly, for the staff `/robs add|remove` commands.
     *
     * The request id is derived from the moment of the adjustment rather than from its arguments,
     * so two deliberate identical grants both land — unlike a sale, where a replay must not pay
     * twice. Must run off the main thread.
     *
     * @return the balance after the change.
     */
    public double adjust(UUID uuid, String username, double amount, boolean credit, String reason) {
        JsonObject body = baseBody(uuid, username);
        body.addProperty("amount", Robs.round(amount));
        body.addProperty("reason", reason);

        String requestId = ApiGateway.requestIdFor(credit ? "add" : "remove", uuid, System.nanoTime());
        body.addProperty("requestId", requestId);

        JsonObject response = client.post(credit ? "/api/robs/add" : "/api/robs/remove", body, requestId);
        double robs = response.has("robs") ? Robs.round(response.get("robs").getAsDouble()) : 0d;

        balances.reconcile(uuid, robs);
        return robs;
    }

    /**
     * Refreshes many balances in one request.
     *
     * This is what the placeholder warm-up uses. Reading balances one at a time cost a request per
     * online player per pass — on a busy server, comfortably the largest source of traffic the
     * plugin produced. One request now covers everyone, and the per-player figures are reconciled
     * into the cache exactly as a single read would.
     *
     * Failures are swallowed: a warm-up that could not run leaves the cached balances as stale as
     * they already were, which is precisely what the cache is for. Must run off the main thread.
     */
    public void refreshBalances(Collection<UUID> uuids) {
        if (uuids.isEmpty()) {
            return;
        }

        JsonArray ids = new JsonArray();
        for (UUID uuid : uuids) {
            ids.add(uuid.toString());
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", settings.guildId());
        body.add("uuids", ids);

        try {
            JsonObject response = client.post("/api/robs/balances", body);
            JsonElement rows = response.get("balances");
            if (rows == null || !rows.isJsonArray()) {
                return;
            }

            for (JsonElement element : rows.getAsJsonArray()) {
                if (!element.isJsonObject()) {
                    continue;
                }

                JsonObject row = element.getAsJsonObject();
                if (!row.has("uuid")) {
                    continue;
                }

                try {
                    balances.reconcile(
                            UUID.fromString(row.get("uuid").getAsString()),
                            row.has("robs") ? Robs.round(row.get("robs").getAsDouble()) : 0d);
                } catch (IllegalArgumentException malformed) {
                    // A uuid the API echoed back that we cannot parse is not worth failing the
                    // whole pass over — every other player in the batch is still reconciled.
                }
            }
        } catch (ApiException error) {
            // Deliberately quiet: the gateway already announces an outage once rather than once
            // per warm-up pass, and every balance simply stays at its cached value.
        }
    }

    /** Records a balance the API confirmed elsewhere, e.g. in a sale response. */
    public void recordBalance(UUID uuid, double robs) {
        balances.reconcile(uuid, robs);
    }

    /** Units of one priced item the player is carrying. Main thread only. */
    public int countInInventory(Player player, ItemPrice price) {
        int total = 0;
        for (ItemStack stack : player.getInventory().getStorageContents()) {
            if (isSellable(stack, price)) {
                total += stack.getAmount();
            }
        }
        return total;
    }

    /**
     * Removes up to {@code requested} units and returns how many were actually taken. Main thread
     * only; the caller credits robs for exactly the returned amount and nothing more.
     */
    public int removeFromInventory(Player player, ItemPrice price, int requested) {
        Inventory inventory = player.getInventory();
        int remaining = requested;

        ItemStack[] contents = inventory.getStorageContents();
        for (int slot = 0; slot < contents.length && remaining > 0; slot++) {
            ItemStack stack = contents[slot];
            if (!isSellable(stack, price)) {
                continue;
            }

            int take = Math.min(remaining, stack.getAmount());
            remaining -= take;

            if (stack.getAmount() == take) {
                inventory.setItem(slot, null);
            } else {
                stack.setAmount(stack.getAmount() - take);
                inventory.setItem(slot, stack);
            }
        }

        return requested - remaining;
    }

    /**
     * Settles a sale whose items have already been removed.
     *
     * The request id is derived from the player and the moment of the sale, so a network retry and
     * a queue replay both resolve to the same key and the API applies the credit once.
     */
    public JsonObject settle(UUID uuid, String username, Map<ItemPrice, Integer> removed) {
        JsonArray lines = new JsonArray();
        for (Map.Entry<ItemPrice, Integer> entry : removed.entrySet()) {
            JsonObject line = new JsonObject();
            line.addProperty("itemKey", entry.getKey().itemKey());
            line.addProperty("amount", entry.getValue());
            lines.add(line);
        }

        JsonObject body = baseBody(uuid, username);
        body.add("lines", lines);

        String requestId = ApiGateway.requestIdFor("sell", uuid, System.currentTimeMillis());
        body.addProperty("requestId", requestId);

        return client.post("/api/robs/sell", body, requestId);
    }

    /**
     * Queues a sale for replay when the API is unreachable.
     *
     * Called only after the items are already gone from the inventory, which is precisely why the
     * request must not be dropped: the player has paid and is owed the robs.
     */
    public double settleDeferred(UUID uuid, String username, Map<ItemPrice, Integer> removed, String requestId) {
        JsonArray lines = new JsonArray();
        double robs = 0d;

        for (Map.Entry<ItemPrice, Integer> entry : removed.entrySet()) {
            JsonObject line = new JsonObject();
            line.addProperty("itemKey", entry.getKey().itemKey());
            line.addProperty("amount", entry.getValue());
            lines.add(line);
            robs = Robs.add(robs, Robs.multiply(entry.getKey().price(), entry.getValue()));
        }

        JsonObject body = baseBody(uuid, username);
        body.add("lines", lines);
        body.addProperty("requestId", requestId);

        gateway.queue().enqueue("/api/robs/sell", body, requestId);

        // Credited locally straight away so the player sees the payout for the ore they just
        // handed over. The API re-prices the sale from its own table when the queue drains, so
        // this figure is a preview — if a price changed in the meantime, the API's number wins.
        balances.addPending(uuid, robs);
        return robs;
    }

    private JsonObject baseBody(UUID uuid, String username) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", settings.guildId());
        body.addProperty("uuid", uuid.toString());
        body.addProperty("username", username);
        body.addProperty("serverId", settings.serverId());
        body.addProperty("serverName", settings.serverName());
        return body;
    }

    /**
     * Only plain, unmodified stacks are sellable — a renamed or enchanted item can be worth far
     * more than the ore it is made of, so anything carrying metadata is left alone.
     */
    private boolean isSellable(ItemStack stack, ItemPrice price) {
        return stack != null && stack.getType() == price.material() && !stack.hasItemMeta();
    }
}
