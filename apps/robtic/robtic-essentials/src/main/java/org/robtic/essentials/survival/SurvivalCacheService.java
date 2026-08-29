package org.robtic.essentials.survival;

import org.robtic.core.cache.CachePolicy;
import org.robtic.core.cache.PlayerCache;
import org.robtic.essentials.model.SurvivalModels.BackBudget;
import org.robtic.essentials.model.SurvivalModels.InventorySnapshot;
import org.robtic.core.entitlement.Entitlements;
import org.robtic.essentials.model.SurvivalModels.Friends;
import org.robtic.essentials.model.SurvivalModels.Homes;
import org.robtic.essentials.model.SurvivalModels.LockedChests;
import org.robtic.essentials.model.SurvivalModels.PlayerSettings;
import org.robtic.essentials.model.SurvivalModels.Profile;
import org.robtic.essentials.model.SurvivalModels.StoredLocation;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The one cache every survival feature reads through.
 *
 * <h2>What is cached, and what makes it go away</h2>
 *
 * <pre>
 *   spawn          server-wide, loaded once     → replaced by /setspawn
 *   homes          per player, no TTL           → replaced by /sethome, /delhome, /renamehome
 *   premium        per player, 30 min           → also cleared on a premium sync
 *   profile        per player, 10 min
 *   back           per player, no TTL           → decremented locally, refetched past resetAt
 *   locks          per player, no TTL           → replaced by /lock and /unlock
 *   portable chest per player, no TTL           → replaced by /linkchest
 *   settings       per player, no TTL           → replaced by /particle, /players, the settings menu
 *   inv snapshot   per player, no TTL           → replaced when a survival world is left
 * </pre>
 *
 * Most of these have no TTL at all, and that is the point rather than an oversight. A home list
 * cannot change behind the plugin's back — the plugin is what changes it — so a clock would only
 * add requests without adding correctness. Only premium and the profile carry one, because those
 * are owned by Discord and genuinely can change while the player is standing still.
 *
 * <h2>Threading</h2>
 *
 * Every `load*` method blocks on the API and must run off the main thread. Every `cached*` method
 * is a memory read and is safe on the tick — which is what the GUIs and placeholders use.
 */
public final class SurvivalCacheService {

    private final SurvivalApi api;
    private final int freeHomeLimitFallback;

    /** Server-wide, so a plain reference rather than a per-player cache. */
    private final AtomicReference<StoredLocation> spawn = new AtomicReference<>();

    private final PlayerCache<Homes> homes = new PlayerCache<>("homes", CachePolicy.FOREVER);
    private final PlayerCache<Entitlements> premium = new PlayerCache<>("premium", CachePolicy.PREMIUM_MILLIS);
    private final PlayerCache<Profile> profiles = new PlayerCache<>("profile", CachePolicy.PROFILE_MILLIS);
    private final PlayerCache<BackBudget> back = new PlayerCache<>("back", CachePolicy.FOREVER);
    private final PlayerCache<LockedChests> locks = new PlayerCache<>("locks", CachePolicy.FOREVER);
    private final PlayerCache<Optional<StoredLocation>> portable = new PlayerCache<>("portable-chest", CachePolicy.FOREVER);
    private final PlayerCache<PlayerSettings> settings = new PlayerCache<>("settings", CachePolicy.FOREVER);
    private final PlayerCache<Friends> friends = new PlayerCache<>("friends", CachePolicy.FOREVER);
    private final PlayerCache<InventorySnapshot> snapshots = new PlayerCache<>("inventory-snapshot", CachePolicy.FOREVER);

    /** Whether a player holds `robtic.tester`, which lifts the premium limits this server enforces. */
    private volatile java.util.function.Predicate<UUID> tester = uuid -> false;

    public SurvivalCacheService(SurvivalApi api, int freeHomeLimitFallback) {
        this.api = api;
        this.freeHomeLimitFallback = freeHomeLimitFallback;
    }

    /**
     * Registers the tester check.
     *
     * A predicate rather than a permission lookup here, because this class deals in UUIDs and has no
     * reason to know that Bukkit permissions exist.
     */
    public void testerWhen(java.util.function.Predicate<UUID> predicate) {
        this.tester = predicate;
    }

    // ─── Spawn ────────────────────────────────────────────────────────────────────────────────

    /**
     * Loaded once at boot. Off-thread.
     *
     * Throws when the API is unreachable, which is a normal state on this server — the caller
     * scheduling this is responsible for deciding that a missing spawn point is not worth a stack
     * trace. See {@code RobticEssentialsPlugin#start}.
     */
    public void loadSpawn() {
        api.spawn().ifPresent(spawn::set);
    }

    /** Safe on the tick — this is what `/spawn` reads, so the command costs no request at all. */
    public Optional<StoredLocation> spawn() {
        return Optional.ofNullable(spawn.get());
    }

    /** Off-thread. Replaces the cached value with what the API confirmed. */
    public StoredLocation setSpawn(UUID uuid, String username, StoredLocation location) {
        StoredLocation saved = api.setSpawn(uuid, username, location);
        spawn.set(saved);
        return saved;
    }

    // ─── Premium ──────────────────────────────────────────────────────────────────────────────

    /**
     * Off-thread. Falls back to a stale entry, then to free, rather than failing.
     *
     * A player whose tier cannot be resolved is treated as free for *limits* — which is the safe
     * direction, since the alternative is handing out premium on an outage.
     */
    public Entitlements loadPremium(UUID uuid) {
        Optional<Entitlements> fresh = premium.get(uuid);
        if (fresh.isPresent()) {
            return fresh.get();
        }

        try {
            Entitlements loaded = api.entitlements(uuid);
            premium.put(uuid, loaded);
            return loaded;
        } catch (RuntimeException error) {
            return premium.stale(uuid).orElseGet(() -> Entitlements.free(freeHomeLimitFallback));
        }
    }

    /**
     * Safe on the tick. Free limits when nothing is cached yet.
     *
     * A tester short-circuits every premium limit this server enforces. Checked here rather than at
     * each of the half-dozen call sites, because a bypass that has to be remembered is a bypass that
     * will be forgotten in exactly the feature somebody wanted to test.
     */
    public Entitlements cachedPremium(UUID uuid) {
        if (tester.test(uuid)) {
            return Entitlements.tester();
        }

        return premium.get(uuid)
                .or(() -> premium.stale(uuid))
                .orElseGet(() -> Entitlements.free(freeHomeLimitFallback));
    }

    /** Called when a premium sync changes something, so the next read is authoritative. */
    public void invalidatePremium(UUID uuid) {
        premium.invalidate(uuid);
        profiles.invalidate(uuid);
    }

    // ─── Homes ────────────────────────────────────────────────────────────────────────────────

    /** Off-thread. Loaded on join and on the first `/home` or `/homes`. */
    public Homes loadHomes(UUID uuid) {
        return homes.getOrLoad(uuid, () -> api.homes(uuid));
    }

    /** Safe on the tick, for the GUI. Empty when the join-time load has not finished. */
    public Optional<Homes> cachedHomes(UUID uuid) {
        return homes.get(uuid);
    }

    /**
     * Off-thread. The mutation's own response is the new cache entry.
     *
     * This is why the API returns the whole list from every home mutation: without it, each of
     * these would have to invalidate and then immediately re-read, doubling the requests.
     */
    public Homes setHome(UUID uuid, String username, String name, StoredLocation location) {
        Homes updated = api.setHome(uuid, username, name, location);
        homes.replace(uuid, updated);
        return updated;
    }

    public Homes deleteHome(UUID uuid, String name) {
        Homes updated = api.deleteHome(uuid, name);
        homes.replace(uuid, updated);
        return updated;
    }

    public Homes renameHome(UUID uuid, String from, String to) {
        Homes updated = api.renameHome(uuid, from, to);
        homes.replace(uuid, updated);
        return updated;
    }

    // ─── Friends ──────────────────────────────────────────────────────────────────────────────

    /** Off-thread. `onlineCsv` is this server's connected list, which only it knows. */
    public Friends loadFriends(UUID uuid, String onlineCsv) {
        return friends.getOrLoad(uuid, () -> api.friends(uuid, onlineCsv));
    }

    /** Off-thread, and always re-reads: presence changes constantly, so the GUI wants it live. */
    public Friends refreshFriends(UUID uuid, String onlineCsv) {
        Friends loaded = api.friends(uuid, onlineCsv);
        friends.replace(uuid, loaded);
        return loaded;
    }

    public Optional<Friends> cachedFriends(UUID uuid) {
        return friends.get(uuid);
    }

    /**
     * Off-thread. Invalidates both sides, because a friendship is a fact about two players and the
     * other one may well be online looking at their own list.
     */
    public String friendAction(UUID uuid, String username, String action, UUID targetUuid, String targetUsername) {
        String outcome = api.friendAction(uuid, username, action, targetUuid, targetUsername);
        friends.invalidate(uuid);
        friends.invalidate(targetUuid);
        return outcome;
    }

    /**
     * The friend-teleport preference now lives with every other player setting.
     *
     * The friend list is invalidated as well because it carries `autoAcceptTp` for display — two
     * caches hold the same fact, and the write has to clear both.
     */
    public PlayerSettings setFriendTpAuto(UUID uuid, boolean autoAccept) {
        com.google.gson.JsonObject changes = new com.google.gson.JsonObject();
        changes.addProperty("friendTpAutoAccept", autoAccept);

        PlayerSettings updated = updateSettings(uuid, changes);
        friends.invalidate(uuid);
        return updated;
    }

    // ─── Back ─────────────────────────────────────────────────────────────────────────────────

    /** Off-thread. Warmed on join so the first `/back` is instant. */
    public BackBudget loadBack(UUID uuid) {
        return back.getOrLoad(uuid, () -> api.backBudget(uuid));
    }

    /**
     * The cached budget, refreshed only when it is worth refreshing.
     *
     * This is the whole `/back` optimisation: with uses left the cached figure is returned and no
     * request happens. At zero the reset time decides — past it the budget has genuinely rolled
     * over and is re-read, before it the player is refused from memory.
     *
     * Off-thread, because the refresh branch calls the API.
     */
    public BackBudget backBudget(UUID uuid) {
        Optional<BackBudget> cached = back.get(uuid);

        if (cached.isPresent()) {
            BackBudget budget = cached.get();
            if (budget.hasRemaining() || !budget.windowElapsed()) {
                return budget;
            }
        }

        BackBudget refreshed = api.backBudget(uuid);
        back.replace(uuid, refreshed);
        return refreshed;
    }

    /** Off-thread. The API's response is authoritative and replaces the local count. */
    public BackBudget spendBack(UUID uuid, String username) {
        BackBudget spent = api.spendBack(uuid, username);
        back.replace(uuid, spent);
        return spent;
    }

    // ─── Chests ───────────────────────────────────────────────────────────────────────────────

    public LockedChests loadLocks(UUID uuid) {
        return locks.getOrLoad(uuid, () -> api.locks(uuid));
    }

    public Optional<LockedChests> cachedLocks(UUID uuid) {
        return locks.get(uuid);
    }

    /** Off-thread. Both mutations invalidate rather than replace — the response is a status, not a list. */
    public com.google.gson.JsonObject lock(UUID uuid, String username, StoredLocation location) {
        com.google.gson.JsonObject response = api.lock(uuid, username, location);
        locks.invalidate(uuid);
        return response;
    }

    public com.google.gson.JsonObject unlock(UUID uuid, StoredLocation location) {
        com.google.gson.JsonObject response = api.unlock(uuid, location);
        locks.invalidate(uuid);
        return response;
    }

    public Optional<StoredLocation> loadPortableChest(UUID uuid) {
        return portable.getOrLoad(uuid, () -> api.portableChest(uuid));
    }

    public StoredLocation linkChest(UUID uuid, StoredLocation location) {
        StoredLocation linked = api.linkChest(uuid, location);
        portable.replace(uuid, Optional.of(linked));
        return linked;
    }

    // ─── Player settings ──────────────────────────────────────────────────────────────────────

    /** Off-thread. Loaded on join, and the only read the lobby needs to apply a player's state. */
    public PlayerSettings loadSettings(UUID uuid) {
        return settings.getOrLoad(uuid, () -> api.settings(uuid));
    }

    /**
     * Safe on the tick.
     *
     * Read constantly — by the particle task, the lobby join flow and the visibility service — so
     * it must never block, and falls back to sane defaults rather than empty.
     */
    public PlayerSettings cachedSettings(UUID uuid) {
        return settings.get(uuid).orElseGet(PlayerSettings::defaults);
    }

    /** Off-thread. The response is the new state, so nothing has to read back afterwards. */
    public PlayerSettings updateSettings(UUID uuid, com.google.gson.JsonObject changes) {
        PlayerSettings updated = api.updateSettings(uuid, changes);
        settings.replace(uuid, updated);
        return updated;
    }

    /** Replaces the cached settings locally, for an optimistic toggle the API has confirmed. */
    public void putSettings(UUID uuid, PlayerSettings value) {
        settings.replace(uuid, value);
    }

    // ─── Survival inventory preview ───────────────────────────────────────────────────────────

    /**
     * Off-thread. Cached without a TTL: a snapshot only changes when the player leaves a survival
     * world, and this server is what captures it — so nothing can change it behind the cache.
     */
    public InventorySnapshot loadInventorySnapshot(UUID uuid) {
        return snapshots.getOrLoad(uuid, () -> api.inventorySnapshot(uuid));
    }

    /** Off-thread. Captures the current survival inventory and refreshes the cached copy. */
    public void captureInventory(UUID uuid, String world, String contents, String armor, String offhand) {
        api.putInventorySnapshot(uuid, world, contents, armor, offhand);
        snapshots.invalidate(uuid);
    }

    // ─── Profile ──────────────────────────────────────────────────────────────────────────────

    public Profile loadProfile(UUID uuid, boolean online) {
        return profiles.getOrLoad(uuid, () -> api.profile(uuid, online));
    }

    /** Ignores the TTL, for `/profile <player>` where the caller explicitly asked for it now. */
    public Profile refreshProfile(UUID uuid, boolean online) {
        Profile loaded = api.profile(uuid, online);
        profiles.replace(uuid, loaded);
        return loaded;
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────────────────────

    /**
     * Warms everything one player needs, in one place, on join.
     *
     * Deliberately sequential: these run on a worker during a join burst, and firing eight parallel
     * requests per player is how a twenty-player restart becomes a hundred and sixty at once.
     */
    public void warm(UUID uuid, String onlineCsv) {
        loadPremium(uuid);
        loadHomes(uuid);
        loadBack(uuid);
        loadSettings(uuid);
        loadFriends(uuid, onlineCsv);
    }

    /** Drops everything for a player who has left. */
    public void forget(UUID uuid) {
        homes.invalidate(uuid);
        premium.invalidate(uuid);
        profiles.invalidate(uuid);
        back.invalidate(uuid);
        locks.invalidate(uuid);
        portable.invalidate(uuid);
        settings.invalidate(uuid);
        snapshots.invalidate(uuid);
        friends.invalidate(uuid);
    }

    /** `/robtic refresh` and the API reconnect edge both drop everything. */
    public void clearAll() {
        spawn.set(null);
        homes.clear();
        premium.clear();
        profiles.clear();
        back.clear();
        locks.clear();
        portable.clear();
        settings.clear();
        snapshots.clear();
        friends.clear();
    }

    /** One line per cache, for `/robtic status`. */
    public List<String> describe() {
        return List.of(
                "spawn: " + (spawn.get() == null ? "not loaded" : "loaded"),
                "homes: " + homes.size(),
                "premium: " + premium.size(),
                "profiles: " + profiles.size(),
                "back: " + back.size(),
                "locks: " + locks.size(),
                "portable-chest: " + portable.size(),
                "settings: " + settings.size(),
                "inventory-snapshot: " + snapshots.size(),
                "friends: " + friends.size());
    }
}
