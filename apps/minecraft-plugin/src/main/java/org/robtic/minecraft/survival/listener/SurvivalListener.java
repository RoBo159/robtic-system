package org.robtic.minecraft.survival.listener;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.model.survival.SurvivalModels.PlayerSettings;
import org.robtic.minecraft.model.survival.SurvivalModels.StoredLocation;
import org.robtic.minecraft.survival.SurvivalApi;
import org.robtic.minecraft.survival.SurvivalCacheService;
import org.robtic.minecraft.survival.PremiumSyncService;
import org.robtic.minecraft.survival.TeleportService;
import org.robtic.minecraft.survival.friend.FriendTeleportService;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The survival feature set's world and connection hooks.
 *
 * <h2>Chest protection is cache-backed, not a lookup per click</h2>
 *
 * A naive implementation would ask the API who owns a chest on every interaction — several times a
 * second on a busy server. Instead the owner of each block is remembered locally once looked up,
 * and the entry is dropped when a lock changes. Opening an unprotected chest, by far the common
 * case, costs one map lookup after the first time.
 */
public final class SurvivalListener implements Listener {

    /** How long a "who owns this block?" answer is kept. Locks change rarely, so this can be long. */
    private static final long LOCK_CACHE_MILLIS = 10 * 60 * 1000L;

    private record LockOwner(String username, long storedAt) {
        boolean expired() {
            return System.currentTimeMillis() - storedAt > LOCK_CACHE_MILLIS;
        }
    }

    private final Plugin plugin;
    private final ApiGateway gateway;
    private final SurvivalApi api;
    private final MessageCatalog messages;
    private final SurvivalCacheService cache;
    private final TeleportService teleports;
    private final FriendTeleportService friendTeleports;
    private final PremiumSyncService premiumSync;

    /** Block key → owner, or a sentinel meaning "known to be unlocked". */
    private final Map<String, LockOwner> lockOwners = new ConcurrentHashMap<>();

    /** When each player's session started, so playtime can be reported as a delta on quit. */
    private final Map<UUID, Long> sessionStart = new ConcurrentHashMap<>();

    /** Deaths seen this session, flushed with the playtime rather than one request each. */
    private final Map<UUID, Integer> deaths = new ConcurrentHashMap<>();
    private final Map<UUID, Integer> kills = new ConcurrentHashMap<>();

    public SurvivalListener(
            Plugin plugin,
            ApiGateway gateway,
            SurvivalApi api,
            MessageCatalog messages,
            SurvivalCacheService cache,
            TeleportService teleports,
            FriendTeleportService friendTeleports,
            PremiumSyncService premiumSync
    ) {
        this.plugin = plugin;
        this.gateway = gateway;
        this.api = api;
        this.messages = messages;
        this.cache = cache;
        this.teleports = teleports;
        this.friendTeleports = friendTeleports;
        this.premiumSync = premiumSync;
    }

    // ─── Connection ───────────────────────────────────────────────────────────────────────────

    /**
     * Warms every cache this player needs, once, off the main thread.
     *
     * This is the single point where the session's data is fetched. Every command afterwards reads
     * memory, which is the whole reason `/home`, `/spawn` and `/back` cost nothing.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();

        sessionStart.put(uuid, System.currentTimeMillis());

        String onlineCsv = onlineCsv();

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            cache.warm(uuid, onlineCsv);

            // Straight after the warm-up, which has already fetched the tier — so bringing the
            // LuckPerms group in line costs no additional request.
            premiumSync.apply(uuid);

            // Applied on the tick, because the join message is a broadcast.
            PlayerSettings settings = cache.cachedSettings(uuid);
            if (settings.cosmeticsAllowed() && settings.joinMessage() != null) {
                plugin.getServer().getScheduler().runTask(plugin, () ->
                        Bukkit.broadcast(MessageCatalog.render(
                                settings.joinMessage().replace("%player%", player.getName()))));
            }
        });
    }

    /**
     * Flushes the session's statistics and drops everything cached for the player.
     *
     * One request rather than one per death: the counters accumulate in memory and are reported as
     * deltas here, which is also what makes them safe to sum across several servers.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();

        PlayerSettings settings = cache.cachedSettings(uuid);
        if (settings.cosmeticsAllowed() && settings.leaveMessage() != null) {
            Bukkit.broadcast(MessageCatalog.render(settings.leaveMessage().replace("%player%", player.getName())));
        }

        Long started = sessionStart.remove(uuid);
        long playtime = started == null ? 0L : System.currentTimeMillis() - started;
        // remove() returns the previous value — reading the map again afterwards would always be
        // zero, which silently threw away every death and kill of the session.
        Integer diedValue = deaths.remove(uuid);
        Integer killedValue = kills.remove(uuid);
        int died = diedValue == null ? 0 : diedValue;
        int killed = killedValue == null ? 0 : killedValue;

        String username = player.getName();

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                api.reportStats(uuid, username, playtime, killed, died);
            } catch (RuntimeException error) {
                plugin.getLogger().fine("Could not report session stats for " + username + ": " + error.getMessage());
            }

            cache.forget(uuid);
        });

        teleports.forget(uuid);
        friendTeleports.forget(uuid);
    }

    // ─── Death, for /back and the statistics ──────────────────────────────────────────────────

    /**
     * Records the death point as `/back`'s destination, and tallies the kill.
     *
     * Captured here rather than on respawn because the player's location is still the place they
     * died — by the time the respawn fires they are at the world spawn.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();

        teleports.remember(victim.getUniqueId(), victim.getLocation());
        deaths.merge(victim.getUniqueId(), 1, Integer::sum);

        Player killer = victim.getKiller();
        if (killer != null && !killer.equals(victim)) {
            kills.merge(killer.getUniqueId(), 1, Integer::sum);
        }
    }

    // ─── Chest protection ─────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        Block block = event.getClickedBlock();

        if (block == null || !isChest(block)) {
            return;
        }

        guard(event.getPlayer(), block, event::setCancelled);
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        if (!isChest(event.getBlock())) {
            return;
        }

        guard(event.getPlayer(), event.getBlock(), event::setCancelled);
    }

    /**
     * Refuses the interaction when somebody else owns the chest.
     *
     * The first look at a block is resolved asynchronously and the interaction is allowed through —
     * blocking the tick on a network call is never acceptable, and the answer is cached from then
     * on. A player who beats the first lookup gets one interaction; every one after is protected.
     */
    private void guard(Player player, Block block, java.util.function.Consumer<Boolean> cancel) {
        String key = key(block);
        LockOwner cached = lockOwners.get(key);

        if (cached != null && !cached.expired()) {
            if (cached.username() == null || cached.username().equalsIgnoreCase(player.getName())) {
                return;
            }

            cancel.accept(true);
            player.sendMessage(messages.prefixed("survival.chest-protected", "player", cached.username()));
            return;
        }

        StoredLocation at = StoredLocation.of(block.getLocation());

        gateway.read(
                () -> api.lockOwnerAt(at),
                owner -> lockOwners.put(key, new LockOwner(owner.orElse(null), System.currentTimeMillis())),
                error -> plugin.getLogger().fine("Could not resolve chest lock: " + error.getMessage()));
    }

    /** Called by the lock commands so the next interaction sees the change immediately. */
    public void invalidateLock(StoredLocation location) {
        lockOwners.remove(key(location));
    }

    private static boolean isChest(Block block) {
        return block.getType() == Material.CHEST || block.getType() == Material.TRAPPED_CHEST;
    }

    private static String key(Block block) {
        return block.getWorld().getName() + ":" + block.getX() + ":" + block.getY() + ":" + block.getZ();
    }

    private static String key(StoredLocation location) {
        return location.world() + ":" + (long) Math.floor(location.x())
                + ":" + (long) Math.floor(location.y())
                + ":" + (long) Math.floor(location.z());
    }

    private static String onlineCsv() {
        return String.join(",", Bukkit.getOnlinePlayers().stream()
                .map(online -> online.getUniqueId().toString())
                .toList());
    }
}
