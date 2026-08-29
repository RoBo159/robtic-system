package org.robtic.core.license;

import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;
import org.robtic.core.license.api.License;
import org.robtic.core.license.api.LicenseHolding;
import org.robtic.core.license.api.LicenseRegistry;
import org.robtic.core.license.api.LicenseStatus;
import org.robtic.core.license.events.PlayerExpireLicenseEvent;
import org.robtic.core.license.events.PlayerLoseLicenseEvent;
import org.robtic.core.license.events.PlayerObtainLicenseEvent;
import org.robtic.core.license.events.PlayerRenewLicenseEvent;
import org.robtic.core.license.events.PlayerUseLicenseEvent;
import org.robtic.core.license.item.LicenseItemFactory;
import org.robtic.core.util.Ids;
import org.robtic.core.util.Robs;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * The public API of the licence system. Everything else in this module is an implementation detail
 * of this class.
 *
 * <h2>The item is the record</h2>
 *
 * A player holds a licence if and only if a genuine licence item is somewhere they can reach. There
 * is no database row, no flag, and nothing to keep in step. That has real consequences a caller
 * should expect:
 *
 * <ul>
 *   <li>a licence given to another player transfers with the item, including its remaining time;</li>
 *   <li>a licence left in a chest that is not the player's ender chest is not held;</li>
 *   <li>an offline player cannot be asked about — their inventory is not loaded, and inventing an
 *       answer would be worse than admitting it. See {@link #statusOf(OfflinePlayer, String)}.</li>
 * </ul>
 *
 * <h2>Where a licence counts as held</h2>
 *
 * The player's own inventory — main, hotbar, armour slots and offhand, all of which
 * {@code PlayerInventory#getContents} covers — and their ender chest. Anywhere else is storage, not
 * possession.
 *
 * <h2>Cost</h2>
 *
 * A scan reads 41 inventory slots and 27 ender chest slots, rejecting anything with no item meta
 * before it looks at a data container. Results are cached per player for a short window, because a
 * placeholder resolves for every player every second and a gate can be consulted several times in
 * one tick. The cache is dropped on any event that could have moved an item — see
 * {@link #invalidate}.
 */
public final class LicenseService {

    private final Plugin plugin;
    private final Logger logger;
    private final LicenseRegistry registry;
    private final LicenseItemFactory items;

    /** Pays and charges. Supplied rather than imported, so this module owns no economy rules. */
    private volatile LicenseEconomy economy = LicenseEconomy.NONE;

    /**
     * Definitions registered from code rather than from {@code licenses.yml}.
     *
     * Replayed after a reload, which clears the registry before re-reading the file. Without this a
     * reload would silently unregister every licence another plugin contributed, and that plugin
     * would have no way to know it needed to register them again.
     */
    private final Map<String, License> fromCode = new ConcurrentHashMap<>();

    /** Per-player scan results, held briefly. See the class comment. */
    private final Map<UUID, Snapshot> cache = new ConcurrentHashMap<>();

    /**
     * Licences already reported as expired, so the event fires once rather than every scan.
     *
     * Keyed by player and licence id. Cleared when the licence is renewed or the player leaves.
     */
    private final Set<String> announcedExpiries = ConcurrentHashMap.newKeySet();

    /** How long a scan result is trusted. Two ticks: long enough to spare a burst, short enough to
     *  never show a stale answer a player would notice. */
    private static final long CACHE_MILLIS = 100L;

    private record Snapshot(Map<String, LicenseHolding> held, long takenAt) {
    }

    public LicenseService(Plugin plugin, LicenseRegistry registry, LicenseItemFactory items) {
        this.plugin = plugin;
        this.logger = plugin.getLogger();
        this.registry = registry;
        this.items = items;
    }

    public LicenseRegistry registry() {
        return registry;
    }

    public LicenseItemFactory items() {
        return items;
    }

    public void economy(LicenseEconomy replacement) {
        this.economy = replacement == null ? LicenseEconomy.NONE : replacement;
    }

    public LicenseEconomy economy() {
        return economy;
    }

    // ─── Registration ─────────────────────────────────────────────────────────────────────────

    /** Registers a licence from code. Survives a reload; ones from the config are re-read instead. */
    public boolean register(License license) {
        if (license == null) {
            return false;
        }

        fromCode.put(Ids.normalise(license.id()), license);
        return registry.register(license);
    }

    public boolean unregister(String id) {
        fromCode.remove(Ids.normalise(id));
        return registry.unregister(id);
    }

    public boolean exists(String id) {
        return registry.exists(id);
    }

    public Optional<License> definition(String id) {
        return registry.get(id);
    }

    public List<License> all() {
        return registry.all();
    }

    /** Re-registers everything contributed from code. Called after a config reload. */
    void replayCodeRegistrations() {
        fromCode.values().forEach(registry::register);
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    /**
     * Every genuine licence this player holds, by id.
     *
     * A player carrying two copies of one licence keeps the one that lasts longest — see
     * {@link #better}. Anything else would make "when does my licence expire" depend on inventory
     * order.
     */
    public Map<String, LicenseHolding> heldBy(Player player) {
        UUID id = player.getUniqueId();
        Snapshot cached = cache.get(id);
        long now = System.currentTimeMillis();

        if (cached != null && now - cached.takenAt() < CACHE_MILLIS) {
            return cached.held();
        }

        Map<String, LicenseHolding> found = scan(player);
        cache.put(id, new Snapshot(found, now));

        return found;
    }

    /** The holding for one licence, if this player has it. */
    public Optional<LicenseHolding> holding(Player player, String licenseId) {
        return Optional.ofNullable(heldBy(player).get(Ids.normalise(licenseId)));
    }

    /**
     * Whether this player may act on a licence, and why not if they may not.
     *
     * The one question every gate in the plugin asks. It also announces an expiry the first time it
     * notices one, which is what makes {@link PlayerExpireLicenseEvent} fire without a sweep — the
     * moment a player tries to use a lapsed licence is exactly when anybody cares.
     */
    public LicenseStatus statusOf(Player player, String licenseId) {
        Optional<LicenseHolding> held = holding(player, licenseId);

        if (held.isEmpty()) {
            return LicenseStatus.MISSING;
        }

        long now = System.currentTimeMillis();
        LicenseStatus status = held.get().status(now);

        if (status == LicenseStatus.EXPIRED) {
            announceExpiry(player.getUniqueId(), held.get().license());

            // The moment a lapse is noticed is the only moment anything is looking at the item, so it
            // is also the only place the worn model can be applied — see
            // {@code LicenseItemFactory#refreshAppearance}, which does nothing when it is already
            // correct and therefore costs a comparison on every call but the first.
            repaint(player, held.get());
        } else {
            // Cleared on a valid read, so a renewed licence can announce again if it lapses later.
            announcedExpiries.remove(expiryKey(player.getUniqueId(), licenseId));
        }

        return status;
    }

    /**
     * Whether an offline player holds a licence.
     *
     * Always {@link LicenseStatus#MISSING}, and deliberately so. Ownership is the item, an offline
     * player's inventory is not loaded, and there is no honest answer — returning "valid" would be a
     * guess and returning a cached value would be a second source of truth of exactly the kind this
     * design exists to avoid.
     *
     * A caller that needs to gate something for an offline player should gate it when they next log
     * in, which is also the only moment it can matter.
     */
    public LicenseStatus statusOf(OfflinePlayer player, String licenseId) {
        Player online = player.getPlayer();

        return online != null ? statusOf(online, licenseId) : LicenseStatus.MISSING;
    }

    /** Convenience: whether the player may use this licence right now. */
    public boolean has(Player player, String licenseId) {
        return statusOf(player, licenseId).usable();
    }

    /**
     * Records that a licence was used for something, and lets a listener refuse.
     *
     * The seam every future system goes through. It checks the licence, fires a cancellable event,
     * and reports whether the action may proceed — so a workspace claim or a marketplace listing is
     * one call rather than a status check plus an event plus a statistic.
     *
     * @param action free text describing what it was used for, for the event and the log
     * @return whether the action may proceed
     */
    public boolean use(Player player, String licenseId, String action) {
        if (!has(player, licenseId)) {
            return false;
        }

        License license = registry.get(licenseId).orElse(null);

        if (license == null) {
            return false;
        }

        if (PlayerUseLicenseEvent.hasListeners()) {
            PlayerUseLicenseEvent event =
                    new PlayerUseLicenseEvent(player.getUniqueId(), license, action);

            plugin.getServer().getPluginManager().callEvent(event);

            if (event.isCancelled()) {
                return false;
            }
        }

        used.forEach(listener -> listener.accept(player.getUniqueId(), license));

        // Consumed after the event rather than before, so a listener that refuses does not also cost
        // the player their licence.
        if (license.consumable()) {
            revoke(player, licenseId, PlayerLoseLicenseEvent.Reason.CONSUMED);
        }

        return true;
    }

    /**
     * Runs when a licence is used, for the statistics bridge.
     *
     * A listener list rather than a Bukkit event because the bridge must run even when nothing else
     * is listening, and because a statistic is not something another plugin should be able to cancel.
     */
    private final List<java.util.function.BiConsumer<UUID, License>> used =
            new java.util.concurrent.CopyOnWriteArrayList<>();

    public void onUsed(java.util.function.BiConsumer<UUID, License> listener) {
        used.add(listener);
    }

    // ─── Scanning ─────────────────────────────────────────────────────────────────────────────

    /**
     * Reads every licence a player is carrying.
     *
     * Both inventories are walked with their slot index kept, because a renewal has to write the
     * item back exactly where it was — replacing it by identity would fail for a stack that Bukkit
     * has copied, which it does more often than is obvious.
     */
    private Map<String, LicenseHolding> scan(Player player) {
        Map<String, LicenseHolding> found = new LinkedHashMap<>();

        collect(player, player.getInventory(), LicenseHolding.Location.INVENTORY, found);
        collect(player, player.getEnderChest(), LicenseHolding.Location.ENDER_CHEST, found);

        return found;
    }

    private void collect(
            Player player,
            Inventory inventory,
            LicenseHolding.Location where,
            Map<String, LicenseHolding> found
    ) {
        ItemStack[] contents = inventory.getContents();

        for (int index = 0; index < contents.length; index++) {
            ItemStack stack = contents[index];

            if (!items.looksLikeLicense(stack)) {
                continue;
            }

            Optional<LicenseItemFactory.Read> read = items.read(stack);

            if (read.isEmpty()) {
                continue;
            }

            if (!read.get().genuine()) {
                // Reported once per player per licence rather than every scan, which would be several
                // times a second. A forged licence is worth an operator's attention and is not worth
                // burying the console over.
                warnForged(player, read.get().license().id());
                continue;
            }

            LicenseItemFactory.Holding holding = read.get().holding();

            LicenseHolding candidate = new LicenseHolding(
                    read.get().license(), stack, where, index,
                    holding.issuedAt(), holding.expiresAt());

            found.merge(read.get().license().id(), candidate, LicenseService::better);
        }
    }

    /**
     * Which of two copies of one licence counts.
     *
     * The one that lasts longest, with a permanent licence beating everything. A player who has
     * found a second copy should not have the worse one decide when they lose access.
     */
    private static LicenseHolding better(LicenseHolding first, LicenseHolding second) {
        if (first.permanent() || second.permanent()) {
            return first.permanent() ? first : second;
        }

        return first.expiresAt() >= second.expiresAt() ? first : second;
    }

    // ─── Issuing and taking ───────────────────────────────────────────────────────────────────

    /**
     * Issues a licence to a player.
     *
     * <h2>The event runs before the item exists</h2>
     *
     * {@link PlayerObtainLicenseEvent} is cancellable, and cancelling it abandons the grant. Firing
     * it after the item was in the inventory would mean a listener refusing a licence the player can
     * already see, and this class then taking it back.
     *
     * @return false when the licence is unknown, a listener refused, or the player had no room —
     *         in which case nothing was given and nothing was consumed
     */
    public boolean grant(Player player, String licenseId, PlayerObtainLicenseEvent.Source source) {
        License license = registry.get(licenseId).orElse(null);

        if (license == null) {
            return false;
        }

        if (PlayerObtainLicenseEvent.hasListeners()) {
            PlayerObtainLicenseEvent event =
                    new PlayerObtainLicenseEvent(player.getUniqueId(), license, source);

            plugin.getServer().getPluginManager().callEvent(event);

            if (event.isCancelled()) {
                return false;
            }
        }

        ItemStack item = items.create(license, System.currentTimeMillis());

        // Anything that did not fit is dropped at the player's feet rather than deleted. A licence
        // that vanished because an inventory was full is the one failure this path must not have.
        player.getInventory().addItem(item).values()
                .forEach(leftOver -> player.getWorld().dropItem(player.getLocation(), leftOver));

        invalidate(player.getUniqueId());
        obtained.forEach(listener -> listener.accept(player.getUniqueId(), license));

        return true;
    }

    private final List<java.util.function.BiConsumer<UUID, License>> obtained =
            new java.util.concurrent.CopyOnWriteArrayList<>();

    /** Runs when a licence is issued, for the statistics bridge. */
    public void onObtained(java.util.function.BiConsumer<UUID, License> listener) {
        obtained.add(listener);
    }

    /**
     * Takes a licence away.
     *
     * Removes one copy — the best one, the same one every other method reports on — rather than
     * every copy, so a player carrying two does not lose both to one command.
     *
     * @return whether anything was removed
     */
    public boolean revoke(Player player, String licenseId, PlayerLoseLicenseEvent.Reason reason) {
        Optional<LicenseHolding> held = holding(player, licenseId);

        if (held.isEmpty()) {
            return false;
        }

        LicenseHolding holding = held.get();
        Inventory inventory = inventoryFor(player, holding.slot());

        // Verified before removal. The cache is short-lived but not instantaneous, and clearing a
        // slot whose contents have changed since the scan would destroy whatever is there now.
        ItemStack current = inventory.getItem(holding.index());

        if (!items.read(current).map(read -> read.license().id().equals(holding.license().id()))
                .orElse(false)) {

            invalidate(player.getUniqueId());
            return false;
        }

        inventory.setItem(holding.index(), null);
        invalidate(player.getUniqueId());

        if (PlayerLoseLicenseEvent.hasListeners()) {
            plugin.getServer().getPluginManager().callEvent(
                    new PlayerLoseLicenseEvent(player.getUniqueId(), holding.license(), reason));
        }

        revoked.forEach(listener -> listener.accept(player.getUniqueId(), holding.license()));

        return true;
    }

    private final List<java.util.function.BiConsumer<UUID, License>> revoked =
            new java.util.concurrent.CopyOnWriteArrayList<>();

    public void onRevoked(java.util.function.BiConsumer<UUID, License> listener) {
        revoked.add(listener);
    }

    // ─── Renewal ──────────────────────────────────────────────────────────────────────────────

    /** Why a renewal did not happen. */
    public enum RenewResult {
        SUCCESS,
        NOT_HELD,
        NOT_RENEWABLE,
        CANNOT_AFFORD,
        PERMANENT,
        ECONOMY_UNAVAILABLE
    }

    /**
     * Renews a licence, charging the player.
     *
     * <h2>Charged first, written second, and never the other way round</h2>
     *
     * The payment either lands or it does not, and only then is the item rewritten. Rewriting first
     * would mean a failed payment left a renewed licence; there is no ordering that is atomic across
     * an inventory and an economy, so the one that fails safely is the one that is used.
     *
     * The item is modified in place rather than replaced, so a licence keeps its serial and anything
     * else written on it — a renewal is the same document with a later date, not a new one.
     */
    public RenewResult renew(Player player, String licenseId) {
        Optional<LicenseHolding> held = holding(player, licenseId);

        if (held.isEmpty()) {
            return RenewResult.NOT_HELD;
        }

        LicenseHolding holding = held.get();
        License license = holding.license();

        if (license.permanent()) {
            return RenewResult.PERMANENT;
        }

        if (!license.canRenew()) {
            return RenewResult.NOT_RENEWABLE;
        }

        if (!economy.available()) {
            return RenewResult.ECONOMY_UNAVAILABLE;
        }

        double cost = license.renewalCost();

        if (Robs.isPositive(cost)
                && !economy.charge(player.getUniqueId(), player.getName(), cost,
                        "license-renew:" + license.id())) {
            return RenewResult.CANNOT_AFFORD;
        }

        long now = System.currentTimeMillis();
        long expiry = holding.renewedExpiry(now, license.renewalPeriod());

        Inventory inventory = inventoryFor(player, holding.slot());
        ItemStack current = inventory.getItem(holding.index());

        Optional<LicenseItemFactory.Read> read = items.read(current);

        if (read.isEmpty() || !read.get().license().id().equals(license.id())) {
            // The item moved between the scan and now. The player has been charged, so the licence is
            // reissued rather than the payment being kept for nothing.
            logger.warning("The licence " + license.id() + " moved while " + player.getName()
                    + " was renewing it. A replacement has been issued so the payment is not lost.");

            grant(player, license.id(), PlayerObtainLicenseEvent.Source.PURCHASE);
            invalidate(player.getUniqueId());

            return RenewResult.SUCCESS;
        }

        items.write(current, license,
                new LicenseItemFactory.Holding(read.get().holding().serial(),
                        read.get().holding().issuedAt(), expiry));

        inventory.setItem(holding.index(), current);
        invalidate(player.getUniqueId());
        announcedExpiries.remove(expiryKey(player.getUniqueId(), license.id()));

        if (PlayerRenewLicenseEvent.hasListeners()) {
            plugin.getServer().getPluginManager().callEvent(
                    new PlayerRenewLicenseEvent(player.getUniqueId(), license, cost, expiry));
        }

        renewedListeners.forEach(listener -> listener.accept(player.getUniqueId(), license, cost));

        return RenewResult.SUCCESS;
    }

    /** Runs when a licence is renewed, for the statistics bridge. */
    public interface RenewalListener {
        void accept(UUID playerId, License license, double cost);
    }

    private final List<RenewalListener> renewedListeners = new java.util.concurrent.CopyOnWriteArrayList<>();

    public void onRenewed(RenewalListener listener) {
        renewedListeners.add(listener);
    }

    /**
     * Forces a licence to expire now, for {@code /license expire}.
     *
     * A testing and moderation tool. It writes an expiry in the past rather than removing the item,
     * because that is what a genuine expiry looks like and testing anything else would be testing
     * the wrong thing.
     */
    public boolean expire(Player player, String licenseId) {
        Optional<LicenseHolding> held = holding(player, licenseId);

        if (held.isEmpty() || held.get().permanent()) {
            return false;
        }

        LicenseHolding holding = held.get();
        Inventory inventory = inventoryFor(player, holding.slot());
        ItemStack current = inventory.getItem(holding.index());

        Optional<LicenseItemFactory.Read> read = items.read(current);

        if (read.isEmpty()) {
            return false;
        }

        items.write(current, holding.license(), new LicenseItemFactory.Holding(
                read.get().holding().serial(),
                read.get().holding().issuedAt(),
                System.currentTimeMillis() - 1L));

        inventory.setItem(holding.index(), current);
        invalidate(player.getUniqueId());

        return true;
    }

    // ─── Cache ────────────────────────────────────────────────────────────────────────────────

    /**
     * Drops a player's cached scan.
     *
     * Called by this class after any change it makes, and by the listener after any event that could
     * have moved an item. The short expiry is a backstop rather than the mechanism — a player who
     * drops a licence should stop having it immediately, not up to a tenth of a second later.
     */
    public void invalidate(UUID playerId) {
        cache.remove(playerId);
    }

    /** Forgets a player entirely. Called when they leave. */
    public void forget(UUID playerId) {
        cache.remove(playerId);
        announcedExpiries.removeIf(key -> key.startsWith(playerId + "|"));
    }

    // ─── Internals ────────────────────────────────────────────────────────────────────────────

    /**
     * Redraws a held licence as worn, once it has lapsed.
     *
     * <h2>The slot is re-read before it is written</h2>
     *
     * Exactly as {@link #revoke} does, and for the same reason: the scan behind {@code holding} is
     * cached briefly, and writing to a slot whose contents have changed since would stamp a licence's
     * model onto whatever is there now. The item is verified to still be the same licence first, and
     * the write is skipped entirely when the model is already right — which it is on every call after
     * the first, because nothing changes it back.
     *
     * A failure here is silent by design. The licence has expired either way; the artwork is
     * cosmetic, and refusing to answer "is this valid?" because a redraw did not land would turn a
     * cosmetic problem into a functional one.
     */
    private void repaint(Player player, LicenseHolding holding) {
        Inventory inventory = inventoryFor(player, holding.slot());
        ItemStack current = inventory.getItem(holding.index());

        Optional<LicenseItemFactory.Read> read = items.read(current);

        if (read.isEmpty() || !read.get().license().id().equals(holding.license().id())) {
            return;
        }

        if (items.refreshAppearance(current, read.get().license(), read.get().holding(),
                System.currentTimeMillis())) {

            inventory.setItem(holding.index(), current);
            invalidate(player.getUniqueId());
        }
    }

    private Inventory inventoryFor(Player player, LicenseHolding.Location where) {
        return where == LicenseHolding.Location.ENDER_CHEST
                ? player.getEnderChest()
                : player.getInventory();
    }

    private void announceExpiry(UUID playerId, License license) {
        if (!announcedExpiries.add(expiryKey(playerId, license.id()))) {
            return;
        }

        expired.forEach(listener -> listener.accept(playerId, license));

        if (PlayerExpireLicenseEvent.hasListeners()) {
            plugin.getServer().getPluginManager()
                    .callEvent(new PlayerExpireLicenseEvent(playerId, license));
        }
    }

    private final List<java.util.function.BiConsumer<UUID, License>> expired =
            new java.util.concurrent.CopyOnWriteArrayList<>();

    public void onExpired(java.util.function.BiConsumer<UUID, License> listener) {
        expired.add(listener);
    }

    private static String expiryKey(UUID playerId, String licenseId) {
        return playerId + "|" + licenseId;
    }

    /** Forged licences already reported, so one player with one fake does not fill the console. */
    private final Set<String> forgedReported = ConcurrentHashMap.newKeySet();

    private void warnForged(Player player, String licenseId) {
        if (forgedReported.add(expiryKey(player.getUniqueId(), licenseId))) {
            logger.warning(player.getName() + " is carrying an item claiming to be the licence \""
                    + licenseId + "\" whose signature does not match. It has been ignored. This means"
                    + " the item's data was written by something other than this plugin.");
        }
    }

    /** Every licence id a player holds, valid or not. For the browser and the placeholders. */
    public List<String> heldIds(Player player) {
        return new ArrayList<>(heldBy(player).keySet());
    }

    /** How many licences this player holds that are currently valid. */
    public long validCount(Player player) {
        long now = System.currentTimeMillis();

        return heldBy(player).values().stream().filter(holding -> !holding.expired(now)).count();
    }

    /** How many they hold that have lapsed. */
    public long expiredCount(Player player) {
        long now = System.currentTimeMillis();

        return heldBy(player).values().stream().filter(holding -> holding.expired(now)).count();
    }
}
