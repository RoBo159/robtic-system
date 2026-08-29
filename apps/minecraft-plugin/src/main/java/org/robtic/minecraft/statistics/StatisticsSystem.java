package org.robtic.minecraft.statistics;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.statistics.api.StatisticRegistry;
import org.robtic.minecraft.statistics.storage.StatisticsStorage;

import java.util.function.Supplier;

/**
 * Builds and owns the statistics system.
 *
 * <h2>The composition root for one module, and nothing more</h2>
 *
 * Same shape as the progression system's: everything is constructor injection, nothing is static,
 * nothing looks anything else up, and the dependency direction is visible on one screen. That is what
 * makes the stated goal — this becoming its own plugin, or being depended on by other plugins —
 * a matter of moving a package rather than reconstructing a boot sequence.
 *
 * <h2>What this module depends on</h2>
 *
 * A {@link Plugin}, a {@link StatisticsStorage}, and a config supplier. Not jobs, not the economy,
 * not workspaces, not the survival module. The dependency arrows all point <em>at</em> this module,
 * which is the property that lets every future system record through it without any of them being
 * able to entangle it.
 *
 * <h2>Lifecycle</h2>
 *
 * Statistics load asynchronously per player on join and are debounced on the way out; a reload
 * re-reads definitions without touching a single stored value. Nothing here blocks the main thread.
 */
public final class StatisticsSystem implements Listener {

    private final Plugin plugin;
    private final Supplier<FileConfiguration> config;

    private final StatisticRegistry registry;
    private final StatisticsRepository repository;
    private final StatisticsService service;

    private volatile StatisticsSettings settings;
    private volatile StatisticsRecorder recorder;

    /**
     * Run when a player's record becomes real and writable. See {@link #onTracked}.
     *
     * Copy-on-write: written at boot, read on every join.
     */
    private final java.util.List<java.util.function.Consumer<java.util.UUID>> tracked =
            new java.util.concurrent.CopyOnWriteArrayList<>();

    /** Task ids, so a reload can reschedule the timers rather than stack a second set. */
    private int flushTask = -1;
    private int sweepTask = -1;
    private int playtimeTask = -1;

    public StatisticsSystem(Plugin plugin, StatisticsStorage storage, Supplier<FileConfiguration> config) {
        this.plugin = plugin;
        this.config = config;

        this.registry = new StatisticRegistry(plugin.getLogger());
        this.repository = new StatisticsRepository(plugin, storage);
        this.service = new StatisticsService(plugin, registry, repository);

        this.settings = new StatisticsSettings(
                config.get().getConfigurationSection("statistics"), plugin.getLogger());
    }

    /**
     * The API every other system uses.
     *
     * The only thing outside this package anybody should hold. The registry, the repository and the
     * storage are reachable through it for the rare caller that needs them, but a system that records
     * a number needs this and nothing else.
     */
    public StatisticsService service() {
        return service;
    }

    public StatisticsSettings settings() {
        return settings;
    }

    public String name() {
        return "statistics";
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────────────────────

    public void enable() {
        loadConfiguration();

        if (!settings.enabled()) {
            plugin.getLogger().info("Statistics are switched off in statistics.yml. Nothing will be "
                    + "recorded; stored values are untouched and return when it is switched back on.");
            return;
        }

        plugin.getServer().getPluginManager().registerEvents(this, plugin);

        // Timers and the recorder first, because the recorder is what registers the tracking hook.
        // Loading the already-online players before that would race their load callbacks against the
        // registration, and a /reload with players on would silently skip their session statistics.
        schedule();

        // Players already online when the plugin enables — a reload, or a late enable — would
        // otherwise have no statistics loaded and silently record nothing that survives.
        for (org.bukkit.entity.Player online : plugin.getServer().getOnlinePlayers()) {
            beginTracking(online.getUniqueId());
        }

        plugin.getLogger().info("Statistics enabled: " + registry.size() + " statistic(s) in "
                + registry.categories().size() + " category/categories, storage = "
                + repository.backend() + ".");
    }

    /**
     * Re-reads {@code statistics.yml}.
     *
     * Definitions are rebuilt from the file and code registrations are replayed on top — see
     * {@link StatisticsService#replayCodeRegistrations}. No stored value is touched by any of it: a
     * reload changes what a number <em>means</em>, never what it is.
     */
    public void reload() {
        loadConfiguration();
        rescheduleRecorder();
    }

    private void loadConfiguration() {
        StatisticsSettings replacement = new StatisticsSettings(
                config.get().getConfigurationSection("statistics"), plugin.getLogger());

        this.settings = replacement;

        // Cleared and rebuilt rather than diffed. A diff would have to decide what to do about a
        // definition that vanished from the file while a player had a value for it — and the answer
        // is "nothing", which is what clearing the *registry* and leaving the *values* alone does.
        registry.clear();

        settings.categories().forEach(registry::register);
        int accepted = registry.registerAll(settings.statistics());

        // Code registrations last, so a plugin's definition wins over a config entry with the same
        // id. The plugin knows the type its own code writes; the file is a server's customisation of
        // presentation, and silently changing a type out from under running code is worse.
        service.replayCodeRegistrations();

        service.zone(settings.zone());
        service.lenient(settings.autoRegister());
        service.forgetWarnings();

        if (accepted < settings.statistics().size()) {
            plugin.getLogger().warning("statistics.yml defined " + settings.statistics().size()
                    + " statistic(s), of which " + accepted + " were accepted.");
        }
    }

    /**
     * Starts the timers.
     *
     * Called once at enable. A reload reschedules only the play-time timer, because its interval is
     * the one thing here derived from a value the recorder owns; the flush and reset intervals are
     * deliberately not reschedulable, since changing them at runtime buys nothing and cancelling a
     * flush timer mid-write is a way to lose a save.
     */
    private void schedule() {
        long flushTicks = Math.max(300L, settings.saveIntervalSeconds() * 20L);

        flushTask = plugin.getServer().getScheduler()
                .runTaskTimer(plugin, repository::flush, flushTicks, flushTicks).getTaskId();

        long sweepTicks = Math.max(1200L, settings.resetSweepMinutes() * 1200L);

        sweepTask = plugin.getServer().getScheduler()
                .runTaskTimer(plugin, service::sweepResets, sweepTicks, sweepTicks).getTaskId();

        rescheduleRecorder();
    }

    /**
     * Registers the vanilla recorder, and its play-time timer, if the config maps anything.
     *
     * A server that records no vanilla facts does not get the listener at all, so it does not pay a
     * handler call on every block break to discover it has nothing to do.
     */
    private void rescheduleRecorder() {
        StatisticsRecorder.Rules rules = StatisticsRecorder.Rules.parse(
                config.get().getConfigurationSection("statistics.record"), plugin.getLogger());

        if (playtimeTask != -1) {
            plugin.getServer().getScheduler().cancelTask(playtimeTask);
            playtimeTask = -1;
        }

        if (!rules.any()) {
            return;
        }

        // The listener is registered once and its rules replaced, rather than unregistering and
        // re-registering on every reload — Bukkit has no clean per-listener unregister, and
        // registering a second instance would have one block break counted twice, then three times.
        if (recorder == null) {
            recorder = new StatisticsRecorder(service, rules);

            plugin.getServer().getPluginManager().registerEvents(recorder, plugin);

            // Join recording goes through the tracking hook rather than PlayerJoinEvent, because the
            // record does not exist yet when that fires. See StatisticsRecorder#recordJoin.
            StatisticsRecorder recording = recorder;
            onTracked(recording::recordJoin);
        } else {
            recorder.rules(rules);
        }

        if (rules.tracksPlaytime()) {
            // A minute at a time. Frequent enough that a crash costs at most a minute of everybody's
            // play time, infrequent enough that it is one pass over the online players per minute.
            long interval = 20L * 60L;
            StatisticsRecorder recording = recorder;

            playtimeTask = plugin.getServer().getScheduler().runTaskTimer(plugin,
                    () -> recording.recordPlaytime(60_000L), interval, interval).getTaskId();
        }
    }

    public void disable() {
        // Saved synchronously: the scheduler stops accepting async tasks during disable, so anything
        // queued here would be silently dropped.
        repository.shutdown();

        for (int task : new int[]{flushTask, sweepTask, playtimeTask}) {
            if (task != -1) {
                plugin.getServer().getScheduler().cancelTask(task);
            }
        }
    }

    // ─── Player lifecycle ─────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        beginTracking(event.getPlayer().getUniqueId());
    }

    /**
     * Loads a player, applies whatever resets came due while they were away, and tells anything
     * waiting for them.
     *
     * <h2>Why the resets run in the callback</h2>
     *
     * A daily counter can only be compared against a period stamp that has actually been read from
     * storage. Running them before the load would clear nothing and then stamp the current period
     * onto an empty record — so the real values would arrive afterwards and never reset.
     *
     * <h2>Why anything recording a join must wait for this</h2>
     *
     * The load replaces whatever was cached, which is the only safe thing it can do: a value written
     * before the load has no way to be reconciled with the stored total it does not yet know about,
     * and guessing would turn a lifetime counter into whatever happened in the last fifty
     * milliseconds. So a write made between {@code PlayerJoinEvent} and the load returning is lost.
     *
     * {@link #onTracked} is how a system avoids that: it fires once the record is real and writable.
     */
    private void beginTracking(java.util.UUID playerId) {
        repository.load(playerId, loaded -> {
            service.applyResets(playerId, true);

            for (java.util.function.Consumer<java.util.UUID> listener : tracked) {
                try {
                    listener.accept(playerId);
                } catch (RuntimeException failure) {
                    plugin.getLogger().warning("A statistics tracking listener threw for " + playerId
                            + " and was ignored: " + failure.getMessage());
                }
            }
        });
    }

    /**
     * Registers something to run once a player's statistics are loaded and writable.
     *
     * The correct place to record anything about a player joining. See {@link #beginTracking}.
     */
    public void onTracked(java.util.function.Consumer<java.util.UUID> listener) {
        tracked.add(listener);
    }

    /**
     * Stops tracking a player, one tick after they leave.
     *
     * Deferred deliberately. Other systems record things during {@code PlayerQuitEvent} — a session
     * length, a last-seen time — and unloading at MONITOR would mean whether those landed depended on
     * the order two MONITOR listeners happened to be registered in. A tick's delay removes the
     * ordering question entirely: every quit handler on the server has run by then.
     *
     * The save is issued by {@code unload} itself, so the delay costs nothing but a tick of memory.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        java.util.UUID playerId = event.getPlayer().getUniqueId();

        plugin.getServer().getScheduler().runTask(plugin, () -> repository.unload(playerId));
    }
}
