package org.robtic.minecraft.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.bukkit.Material;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.model.ItemPrice;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Logger;

/**
 * The guild's price table, cached in memory.
 *
 * Prices are owned by Discord and only ever read here. The cache is refreshed on a timer and
 * dropped immediately when a `price_invalidate` event arrives, so an admin edit is live within one
 * poll rather than after the TTL.
 *
 * When the API is unreachable the last known table is kept and served: selling ore at a price that
 * is a few minutes stale is a far smaller problem than an exchange that stops working during an
 * outage. Balances get the opposite treatment for the opposite reason.
 */
public final class PriceService {

    private final ApiClient client;
    private final ApiSettings settings;
    private final Logger logger;
    private final long cacheMillis;

    private volatile Map<String, ItemPrice> byKey = Collections.emptyMap();
    private volatile Map<Material, ItemPrice> byMaterial = Collections.emptyMap();
    private volatile long expiresAt;
    private final AtomicBoolean refreshing = new AtomicBoolean(false);

    public PriceService(ApiClient client, ApiSettings settings, Logger logger, long cacheMillis) {
        this.client = client;
        this.settings = settings;
        this.logger = logger;
        this.cacheMillis = cacheMillis;
    }

    /** Every enabled item, in configured order. Must run off the main thread. */
    public List<ItemPrice> sellable() {
        refreshIfStale();
        return byKey.values().stream().filter(ItemPrice::enabled).toList();
    }

    public Optional<ItemPrice> byItemKey(String itemKey) {
        refreshIfStale();
        return Optional.ofNullable(byKey.get(itemKey.toUpperCase()));
    }

    public Optional<ItemPrice> byMaterial(Material material) {
        refreshIfStale();
        return Optional.ofNullable(byMaterial.get(material));
    }

    public void invalidate() {
        expiresAt = 0L;
    }

    public boolean isLoaded() {
        return !byKey.isEmpty();
    }

    /**
     * Refreshes when stale.
     *
     * The fetch happens **outside** any lock — the previous implementation held a monitor across
     * the query, so one slow round trip blocked every other caller. Here a second thread arriving
     * during a refresh simply serves the existing table for a moment longer.
     */
    private void refreshIfStale() {
        if (System.currentTimeMillis() < expiresAt) {
            return;
        }

        if (!refreshing.compareAndSet(false, true)) {
            return;
        }

        try {
            apply(client.get("/api/robs/prices", Map.of("guildId", settings.guildId())));
        } catch (RuntimeException error) {
            // The old table stays in place and the retry window is short, so an outage degrades to
            // slightly stale prices rather than an empty exchange menu.
            expiresAt = System.currentTimeMillis() + Math.min(cacheMillis, 15_000L);
            logger.fine("Could not refresh prices: " + error.getMessage());
        } finally {
            refreshing.set(false);
        }
    }

    /** Applies a table, whether fetched here or delivered in the startup bundle. */
    public void apply(JsonObject payload) {
        JsonElement items = payload.get("items");
        if (items == null || !items.isJsonArray()) {
            return;
        }

        Map<String, ItemPrice> keyed = new LinkedHashMap<>();
        Map<Material, ItemPrice> materials = new LinkedHashMap<>();

        for (JsonElement element : items.getAsJsonArray()) {
            JsonObject row = element.getAsJsonObject();
            String itemKey = row.get("itemKey").getAsString();
            Material material = Material.matchMaterial(itemKey);

            if (material == null) {
                logger.warning("Unknown item key in the price table: " + itemKey);
                continue;
            }

            ItemPrice price = new ItemPrice(
                    itemKey,
                    material,
                    org.robtic.minecraft.util.Robs.round(row.get("price").getAsDouble()),
                    !row.has("enabled") || row.get("enabled").getAsBoolean()
            );

            keyed.put(itemKey, price);
            materials.put(material, price);
        }

        this.byKey = Collections.unmodifiableMap(keyed);
        this.byMaterial = Collections.unmodifiableMap(materials);
        this.expiresAt = System.currentTimeMillis() + cacheMillis;
    }

    /** Applies the `prices` array from the startup bundle, which nests it one level differently. */
    public void applyBundle(JsonArray prices) {
        JsonObject wrapper = new JsonObject();
        wrapper.add("items", prices);
        apply(wrapper);
    }
}
