package org.robtic.minecraft.statistics;

import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.statistics.api.ResetPolicy;
import org.robtic.minecraft.statistics.api.StatisticCategory;
import org.robtic.minecraft.statistics.api.StatisticDefinition;
import org.robtic.minecraft.statistics.api.StatisticRegistry;
import org.robtic.minecraft.statistics.api.StatisticTypes;
import org.robtic.minecraft.statistics.events.StatisticChangedEvent;
import org.robtic.minecraft.statistics.events.StatisticRegisteredEvent;
import org.robtic.minecraft.statistics.events.StatisticResetEvent;
import org.robtic.minecraft.statistics.storage.PlayerStatistics;
import org.robtic.minecraft.util.Ids;

import java.time.ZoneId;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * The public API of the statistics system. Everything else in this module is an implementation
 * detail of this class.
 *
 * <h2>One source of truth</h2>
 *
 * The point of this system is that no other system keeps a counter. A jobs module does not track
 * blocks mined, a badge module does not track kills, a leaderboard does not accumulate anything — all
 * of them read and write here, by id. Two systems counting the same event is how a server ends up
 * with a badge that says 5,000 and a leaderboard that says 4,880 and no way to decide which is
 * wrong.
 *
 * <h2>Statistics record facts and nothing else</h2>
 *
 * There is deliberately no way to attach a reward, a threshold or a consequence to a statistic here.
 * "Mined 5,000 coal" is a fact; "is now a level 10 Miner" is a judgement, and judgements belong to
 * the system making them. Anything that wants to react listens for {@link StatisticChangedEvent}.
 *
 * <h2>Writes only land for players who are loaded</h2>
 *
 * A write for a player whose record has not loaded is dropped, and {@link #isTracking} is how a
 * caller finds out in advance. Two alternatives were considered and are worse:
 *
 * <ul>
 *   <li><b>Load the account first.</b> Turns one API call into an unbounded fan-out of database
 *       reads issued from the tick — and a system recording against a thousand offline players would
 *       do so without any indication that it had.</li>
 *   <li><b>Keep it in memory anyway.</b> A cache entry for an account nobody is going to log in as
 *       is never unloaded, so the map grows for as long as the server runs. It also cannot be
 *       reconciled: an increment made before the stored total is known has no correct resolution
 *       once that total arrives.</li>
 * </ul>
 *
 * This also covers the window between {@code PlayerJoinEvent} and the record finishing loading.
 * Anything that wants to record a player joining uses {@code StatisticsSystem.onTracked}, which fires
 * once the record is real.
 *
 * <h2>Cost</h2>
 *
 * The common path — {@link #increment} on a registered statistic for an online player — is one hash
 * lookup for the definition, one for the player, one for the value, and a compare-and-set. It
 * allocates nothing, and fires no event unless something is listening. It is safe to call from a
 * block-break handler, which is the bar this had to clear.
 */
public final class StatisticsService {

    private final Plugin plugin;
    private final Logger logger;
    private final StatisticRegistry registry;
    private final StatisticsRepository repository;

    /**
     * Definitions registered from code rather than from {@code statistics.yml}.
     *
     * Replayed after a reload, which clears the registry before re-reading the file. Without this, a
     * reload would silently unregister every statistic another plugin had contributed, and that
     * plugin would have no way to know it needed to register them again.
     */
    private final java.util.Map<String, StatisticDefinition> fromCode = new ConcurrentHashMap<>();

    /**
     * Ids that have already been complained about.
     *
     * A write to an unregistered statistic is a programming mistake, and a programming mistake on a
     * path called thousands of times a second must warn once, not thousands of times. Without this
     * the console fills faster than an operator can read it and the actual problem is buried.
     */
    private final Set<String> warned = ConcurrentHashMap.newKeySet();

    private volatile ZoneId zone = ZoneId.systemDefault();

    /** Whether unknown ids are auto-registered on first use. See {@link #lenient}. */
    private volatile boolean lenient;

    public StatisticsService(Plugin plugin, StatisticRegistry registry, StatisticsRepository repository) {
        this.plugin = plugin;
        this.logger = plugin.getLogger();
        this.registry = registry;
        this.repository = repository;

        registry.onRegistered(this::announce);
    }

    // ─── Configuration ────────────────────────────────────────────────────────────────────────

    /** The timezone periodic resets are evaluated in. */
    public void zone(ZoneId replacement) {
        this.zone = replacement == null ? ZoneId.systemDefault() : replacement;
    }

    public ZoneId zone() {
        return zone;
    }

    /**
     * Whether a write to an unregistered id quietly registers a default counter for it.
     *
     * Off by default, and that default is the important one: an unregistered id is nearly always a
     * typo, and a typo that silently creates a second counter alongside the real one is the exact
     * failure this module exists to prevent. A server prototyping a new system can switch it on and
     * skip writing definitions until the shape settles.
     */
    public void lenient(boolean lenient) {
        this.lenient = lenient;
    }

    public StatisticRegistry registry() {
        return registry;
    }

    public StatisticsRepository repository() {
        return repository;
    }

    // ─── Registration ─────────────────────────────────────────────────────────────────────────

    /**
     * Registers a statistic from code.
     *
     * The path a plugin uses. Definitions registered this way survive a reload; ones read from
     * {@code statistics.yml} are re-read from the file instead.
     */
    public boolean register(StatisticDefinition definition) {
        if (definition == null) {
            return false;
        }

        fromCode.put(Ids.normalise(definition.id()), definition);
        return registry.register(definition);
    }

    /** Registers a category from code. */
    public boolean register(StatisticCategory category) {
        return registry.register(category);
    }

    /** Removes a definition. Stored player values are untouched — see {@link StatisticRegistry}. */
    public boolean unregister(String id) {
        fromCode.remove(Ids.normalise(id));
        return registry.unregister(id);
    }

    /** Whether a statistic is registered. */
    public boolean hasStatistic(String id) {
        return registry.exists(id);
    }

    public Optional<StatisticDefinition> definition(String id) {
        return registry.get(id);
    }

    /** Re-registers everything that was contributed from code. Called after a config reload. */
    void replayCodeRegistrations() {
        fromCode.values().forEach(registry::register);
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    /**
     * A player's value.
     *
     * Returns the definition's default for a statistic they have never recorded, and zero for one
     * that is not registered — so a caller reading a statistic that has been unregistered by a
     * disabled plugin gets a number rather than an exception.
     */
    public long get(UUID playerId, String id) {
        StatisticDefinition definition = registry.get(id).orElse(null);

        if (definition == null) {
            return 0L;
        }

        // peek, not get: a read must never insert a cache entry. See StatisticsRepository#get.
        return repository.peek(playerId)
                .map(statistics -> statistics.get(definition.id(), definition.defaultValue()))
                .orElseGet(definition::defaultValue);
    }

    public double getDouble(UUID playerId, String id) {
        return StatisticTypes.decodeDouble(get(playerId, id));
    }

    public boolean getBoolean(UUID playerId, String id) {
        return StatisticTypes.decodeBoolean(get(playerId, id));
    }

    public String getText(UUID playerId, String id) {
        StatisticDefinition definition = registry.get(id).orElse(null);

        if (definition == null) {
            return "";
        }

        return repository.peek(playerId)
                .map(statistics -> statistics.getText(definition.id(), definition.defaultText()))
                .orElseGet(definition::defaultText);
    }

    /** The value rendered through its type, for display and placeholders. */
    public String format(UUID playerId, String id) {
        StatisticDefinition definition = registry.get(id).orElse(null);

        if (definition == null) {
            return "";
        }

        return definition.textual()
                ? definition.format(getText(playerId, id))
                : definition.format(get(playerId, id));
    }

    /** Whether this player has ever recorded a value for this statistic. */
    public boolean has(UUID playerId, String id) {
        return repository.peek(playerId)
                .map(statistics -> statistics.has(Ids.normalise(id)))
                .orElse(false);
    }

    /** Whether writes for this player will be persisted. False for an offline or failed-load player. */
    public boolean isTracking(UUID playerId) {
        return repository.isLoaded(playerId);
    }

    /** The sum of every statistic in a category. For a headline figure in a profile. */
    public long total(UUID playerId, String categoryId) {
        long total = 0L;

        for (StatisticDefinition definition : registry.byCategory(categoryId)) {
            if (!definition.textual()) {
                total = StatisticTypes.addSaturating(total, get(playerId, definition.id()));
            }
        }

        return total;
    }

    // ─── Writing ──────────────────────────────────────────────────────────────────────────────

    /** Adds one. The hot path, and the method nearly every caller wants. */
    public long increment(UUID playerId, String id) {
        return add(playerId, id, 1L);
    }

    public long decrement(UUID playerId, String id) {
        return add(playerId, id, -1L);
    }

    /**
     * Adds to a counter, saturating at the bounds of a {@code long}.
     *
     * @return the value after the change, or the current value when the statistic is unknown or is
     *         not one that can be accumulated into
     */
    public long add(UUID playerId, String id, long amount) {
        StatisticDefinition definition = resolve(id);

        if (definition == null) {
            return 0L;
        }

        if (!definition.accumulable()) {
            warnOnce(definition.id(), "\"" + definition.id() + "\" is a "
                    + definition.type().id() + " statistic and cannot be added to. Use set().");
            return get(playerId, definition.id());
        }

        PlayerStatistics statistics = writable(playerId);

        if (statistics == null) {
            return definition.defaultValue();
        }

        long previous = statistics.get(definition.id(), definition.defaultValue());
        long current = statistics.add(definition.id(), definition.defaultValue(), amount);

        fire(playerId, definition, previous, current);
        return current;
    }

    public long subtract(UUID playerId, String id, long amount) {
        return add(playerId, id, -amount);
    }

    /** Adds to a {@code double} statistic. @return the value after the change */
    public double addDouble(UUID playerId, String id, double amount) {
        StatisticDefinition definition = resolve(id);

        if (definition == null || !definition.accumulable()) {
            return getDouble(playerId, id);
        }

        PlayerStatistics statistics = writable(playerId);

        if (statistics == null) {
            return StatisticTypes.decodeDouble(definition.defaultValue());
        }

        long previous = statistics.get(definition.id(), definition.defaultValue());
        double current = statistics.addDouble(definition.id(), definition.defaultValue(), amount);

        fire(playerId, definition, previous, StatisticTypes.encodeDouble(current));
        return current;
    }

    /** Replaces a value outright. The only way to write a timestamp, a boolean or a text statistic. */
    public void set(UUID playerId, String id, long value) {
        StatisticDefinition definition = resolve(id);

        if (definition == null) {
            return;
        }

        PlayerStatistics statistics = writable(playerId);

        if (statistics == null) {
            return;
        }

        long previous = statistics.set(definition.id(), definition.defaultValue(), value);

        if (previous != value) {
            fire(playerId, definition, previous, value);
        }
    }

    public void setDouble(UUID playerId, String id, double value) {
        set(playerId, id, StatisticTypes.encodeDouble(value));
    }

    public void setBoolean(UUID playerId, String id, boolean value) {
        set(playerId, id, StatisticTypes.encodeBoolean(value));
    }

    /** Records a moment. Pass {@code System.currentTimeMillis()} for "now". */
    public void setTimestamp(UUID playerId, String id, long epochMillis) {
        set(playerId, id, epochMillis);
    }

    /**
     * Writes a value only if the player has never had one.
     *
     * The "first time they did X" write. It is not {@link #raise}: a later timestamp is a larger
     * number, so raising would move "first joined" forward on every single login — which reads as
     * correct right up until somebody notices every player first joined today.
     *
     * @return whether it was written
     */
    public boolean setIfAbsent(UUID playerId, String id, long value) {
        StatisticDefinition definition = resolve(id);

        if (definition == null) {
            return false;
        }

        PlayerStatistics statistics = writable(playerId);

        if (statistics == null || statistics.has(definition.id())) {
            return false;
        }

        statistics.set(definition.id(), definition.defaultValue(), value);
        fire(playerId, definition, definition.defaultValue(), value);

        return true;
    }

    public void setText(UUID playerId, String id, String value) {
        StatisticDefinition definition = resolve(id);

        if (definition == null) {
            return;
        }

        if (!definition.textual()) {
            warnOnce(definition.id(), "\"" + definition.id() + "\" is a "
                    + definition.type().id() + " statistic and cannot hold text.");
            return;
        }

        PlayerStatistics statistics = writable(playerId);

        if (statistics == null) {
            return;
        }

        String previous = statistics.setText(definition.id(), definition.defaultText(), value);

        if (!java.util.Objects.equals(previous, value) && StatisticChangedEvent.hasListeners()) {
            plugin.getServer().getPluginManager()
                    .callEvent(new StatisticChangedEvent(playerId, definition, previous, value));
        }
    }

    /**
     * Raises a statistic to a value, if it is not already higher.
     *
     * The "personal best" write, provided because doing it in the caller means a read, a comparison
     * and a write that another thread can interleave with — turning a record into a lost update.
     *
     * @return the value after the change
     */
    public long raise(UUID playerId, String id, long value) {
        StatisticDefinition definition = resolve(id);

        if (definition == null) {
            return 0L;
        }

        PlayerStatistics statistics = writable(playerId);

        if (statistics == null) {
            return definition.defaultValue();
        }

        long previous = statistics.get(definition.id(), definition.defaultValue());

        if (value <= previous) {
            return previous;
        }

        statistics.set(definition.id(), definition.defaultValue(), value);
        fire(playerId, definition, previous, value);

        return value;
    }

    // ─── Resetting ────────────────────────────────────────────────────────────────────────────

    /**
     * Puts one statistic back to its default.
     *
     * <h2>Only for a tracked player</h2>
     *
     * Resetting an account nobody has loaded does nothing, and says so through the return value
     * rather than appearing to work. The alternative — loading the account, clearing it and writing
     * it back — is a plausible feature and a different one; making it a silent side effect of a
     * method that normally touches memory would mean an admin command against a thousand offline
     * players quietly became a thousand database round trips.
     *
     * @return whether anything was cleared
     */
    public boolean reset(UUID playerId, String id) {
        StatisticDefinition definition = registry.get(id).orElse(null);
        PlayerStatistics statistics = repository.peek(playerId).orElse(null);

        if (definition == null || statistics == null || !statistics.clear(definition.id())) {
            return false;
        }

        fireReset(playerId, Set.of(definition.id()), StatisticResetEvent.Cause.MANUAL);
        return true;
    }

    /** Puts every statistic in a category back to its default. @return how many were cleared */
    public int resetCategory(UUID playerId, String categoryId) {
        PlayerStatistics statistics = repository.peek(playerId).orElse(null);

        if (statistics == null) {
            return 0;
        }

        Set<String> cleared = new LinkedHashSet<>();

        for (StatisticDefinition definition : registry.byCategory(categoryId)) {
            if (statistics.clear(definition.id())) {
                cleared.add(definition.id());
            }
        }

        fireReset(playerId, cleared, StatisticResetEvent.Cause.MANUAL);
        return cleared.size();
    }

    /**
     * Clears everything this player has recorded.
     *
     * Including values whose definitions this server does not have — a plugin that is currently
     * disabled. "Reset all" that quietly left some behind would be worse than either alternative.
     *
     * @return how many statistics were cleared
     */
    public int resetAll(UUID playerId) {
        PlayerStatistics statistics = repository.peek(playerId).orElse(null);

        if (statistics == null) {
            return 0;
        }

        Set<String> cleared = new LinkedHashSet<>(statistics.numericIds());
        cleared.addAll(statistics.textIds());

        if (cleared.isEmpty()) {
            return 0;
        }

        statistics.clearAll();
        fireReset(playerId, cleared, StatisticResetEvent.Cause.MANUAL);

        return cleared.size();
    }

    /**
     * Applies whatever reset policies have come due for a player.
     *
     * Run when their data loads and on the periodic sweep. Nothing is scheduled for a rollover — see
     * {@link ResetPolicy} for why comparing period stamps is the only approach that survives a server
     * being down at midnight.
     *
     * @param sessionStart true on load, when {@link ResetPolicy#SESSION} statistics also clear
     */
    public void applyResets(UUID playerId, boolean sessionStart) {
        PlayerStatistics statistics = repository.peek(playerId).orElse(null);

        if (statistics == null) {
            return;
        }

        long now = System.currentTimeMillis();

        Set<String> cleared = new LinkedHashSet<>();
        Set<ResetPolicy> advanced = new LinkedHashSet<>();

        for (StatisticDefinition definition : registry.resettable()) {
            ResetPolicy policy = definition.resetPolicy();

            if (policy == ResetPolicy.SESSION) {
                if (sessionStart && statistics.clear(definition.id())) {
                    cleared.add(definition.id());
                }
                continue;
            }

            Long stamp = policy.stamp(now, zone).orElse(null);

            if (stamp == null || statistics.period(policy) == stamp) {
                continue;
            }

            if (statistics.clear(definition.id())) {
                cleared.add(definition.id());
            }

            advanced.add(policy);
        }

        // Stamps are advanced after the sweep, not during it. Advancing as each statistic is cleared
        // would make the second statistic under the same policy see a stamp that already matches and
        // skip its own reset.
        for (ResetPolicy policy : advanced) {
            policy.stamp(now, zone).ifPresent(stamp -> statistics.period(policy, stamp));
        }

        if (!cleared.isEmpty()) {
            fireReset(playerId, cleared, sessionStart
                    ? StatisticResetEvent.Cause.SESSION_START
                    : StatisticResetEvent.Cause.POLICY);
        }
    }

    /** Runs {@link #applyResets} for every tracked player. Called on a slow timer. */
    public void sweepResets() {
        for (UUID playerId : repository.tracked()) {
            try {
                applyResets(playerId, false);
            } catch (RuntimeException failure) {
                logger.warning("Reset sweep failed for " + playerId + ": " + failure.getMessage());
            }
        }
    }

    // ─── Internals ────────────────────────────────────────────────────────────────────────────

    /**
     * Finds the definition for a write, optionally creating one.
     *
     * @return null when the id is unknown and leniency is off, having warned exactly once
     */
    private StatisticDefinition resolve(String id) {
        String normalised = Ids.normalise(id);
        StatisticDefinition definition = registry.get(normalised).orElse(null);

        if (definition != null) {
            return definition;
        }

        if (!lenient) {
            warnOnce(normalised, "Something wrote to the unregistered statistic \"" + normalised
                    + "\". It was ignored. Register it in statistics.yml or from code, or switch on "
                    + "statistics.yml → auto-register to accept unknown ids.");
            return null;
        }

        if (!Ids.valid(normalised)) {
            warnOnce(normalised, "Something wrote to the statistic \"" + id + "\", whose id "
                    + Ids.describeProblem(normalised) + ". It was ignored.");
            return null;
        }

        StatisticDefinition created =
                StatisticDefinition.counter(normalised, StatisticCategory.DEFAULT, normalised);

        registry.register(created);
        logger.fine("Auto-registered the statistic \"" + normalised + "\".");

        return created;
    }

    /**
     * The record a write should go into, or null when this player has none.
     *
     * Every write path goes through here, so "a write for an unloaded player is dropped" is stated
     * once rather than being a rule each method remembers. It does not create an entry: see the class
     * comment for why an increment against an account that has not loaded cannot be reconciled, and
     * why keeping one would grow the cache for as long as the server runs.
     *
     * Silent, deliberately. This is the ordinary state of affairs for an offline player, not a fault,
     * and a warning here would fire for every statistic a leaderboard rebuild touched.
     */
    private PlayerStatistics writable(UUID playerId) {
        return repository.peek(playerId).orElse(null);
    }

    /** Announces a change, allocating nothing when nothing is listening. */
    private void fire(UUID playerId, StatisticDefinition definition, long previous, long current) {
        if (previous == current || !StatisticChangedEvent.hasListeners()) {
            return;
        }

        plugin.getServer().getPluginManager()
                .callEvent(new StatisticChangedEvent(playerId, definition, previous, current));
    }

    private void fireReset(UUID playerId, Set<String> ids, StatisticResetEvent.Cause cause) {
        if (ids.isEmpty() || !StatisticResetEvent.hasListeners()) {
            return;
        }

        plugin.getServer().getPluginManager().callEvent(new StatisticResetEvent(playerId, ids, cause));
    }

    /**
     * Announces a registration.
     *
     * Called by the registry, which does not know what a Bukkit event is. Guarded because
     * registration happens during enable, when the plugin manager exists but firing an event for
     * several hundred definitions with nothing listening is pure waste.
     */
    private void announce(StatisticDefinition definition, boolean replacement) {
        if (!StatisticRegisteredEvent.hasListeners()) {
            return;
        }

        plugin.getServer().getPluginManager()
                .callEvent(new StatisticRegisteredEvent(definition, replacement));
    }

    /** Warns about an id once per server run. See {@link #warned}. */
    private void warnOnce(String id, String message) {
        if (warned.add(id)) {
            logger.warning(message);
        }
    }

    /** Clears the once-only warnings, so a reload that fixes a typo reports honestly afterwards. */
    void forgetWarnings() {
        warned.clear();
    }

    /** Every definition, for a menu that lists them. */
    public List<StatisticDefinition> all() {
        return registry.all();
    }

    public List<StatisticDefinition> byCategory(String categoryId) {
        return registry.byCategory(categoryId);
    }

    public List<StatisticCategory> categories() {
        return registry.categories();
    }
}
