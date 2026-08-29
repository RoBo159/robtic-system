package org.robtic.essentials.afk;

import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;
import java.util.logging.Level;

/**
 * The AFK lobby: detecting inactivity, moving players, and putting them back.
 *
 * <h2>All of the behaviour lives here</h2>
 *
 * The listeners do one thing — call {@link #touch(UUID)} — and every decision about what that means
 * is made in this class. That is what keeps "should this player be moved?" answerable in one place
 * rather than spread across a dozen event handlers.
 *
 * <h2>Cost</h2>
 *
 * Recording activity is a map write of a long, which is what makes it affordable on
 * {@code PlayerMoveEvent}. Nothing is scanned per tick: one task sweeps every
 * {@code check-interval-ticks} (5 seconds by default) and only players idle beyond the timeout are
 * touched at all.
 *
 * <h2>Durability</h2>
 *
 * A player who disconnects while AFK would otherwise have their real position lost — the server
 * saves them where they are, which is the lobby. Snapshots are therefore written to
 * {@code afk-state.yml} and restored on rejoin, so a restart mid-AFK strands nobody.
 *
 * <h2>Settlement</h2>
 *
 * A session is paid for exactly once, by {@link AfkRewardService}, at one of three moments: coming
 * back, disconnecting, or the server stopping. Every one of those routes through
 * {@link #settle(UUID, String, AfkSnapshot, boolean)}, and the snapshot it settles is marked so a
 * second attempt on the same session — a disconnect followed by the restore on the next join — pays
 * nothing. Nothing else writes, and nothing writes on a timer.
 */
public final class AfkService {

    private final Plugin plugin;
    private final MessageCatalog messages;
    private final AfkRewardService rewards;
    private final File stateFile;

    /** Last activity per online player. Written on every activity event, so it stays cheap. */
    private final Map<UUID, Long> lastActive = new ConcurrentHashMap<>();

    /** Where each AFK player came from. Absence means "not AFK". */
    private final Map<UUID, AfkSnapshot> afk = new ConcurrentHashMap<>();

    /** Players who may not be moved, e.g. staff in `/admin`. Consulted live, never cached. */
    private volatile Predicate<UUID> exempt = uuid -> false;

    /**
     * Re-applies everyone's visibility. Injected rather than depended on.
     *
     * Who can see whom is one question with one owner — {@code PlayerVisibilityService} — and this
     * class has no business knowing that the lobby also has opinions about it. Handing it a callback
     * keeps the AFK rule ("an AFK player sees nobody and is seen by nobody") declared in the same
     * place as every other visibility rule, so the two cannot end up fighting over the same player.
     */
    private volatile Runnable refreshVisibility = () -> {
    };

    /** Run when a player goes AFK, so the overlay loop can start on demand. */
    private volatile Runnable onAfkStarted = () -> {
    };

    private volatile AfkSettings settings;

    public AfkService(Plugin plugin, AfkSettings settings, MessageCatalog messages, AfkRewardService rewards) {
        this.plugin = plugin;
        this.settings = settings;
        this.messages = messages;
        this.rewards = rewards;
        this.stateFile = new File(plugin.getDataFolder(), "afk-state.yml");
    }

    /** Swapped in on reload, so a changed timeout applies without a restart. */
    public void updateSettings(AfkSettings replacement) {
        this.settings = replacement;
    }

    /**
     * Registers who must never be moved.
     *
     * A predicate rather than a dependency on the staff service: this class has no reason to know
     * what staff mode is, and a future exemption should not require editing it.
     */
    public void exemptWhen(Predicate<UUID> predicate) {
        this.exempt = predicate;
    }

    /** Registers how visibility is re-applied after somebody enters or leaves the AFK world. */
    public void onVisibilityChanged(Runnable action) {
        this.refreshVisibility = action;
    }

    /**
     * Registers what runs when a player goes AFK.
     *
     * A callback rather than a dependency on the overlay: this class decides who is AFK and has no
     * business knowing that anything is drawn on a screen because of it.
     */
    public void onAfkStarted(Runnable action) {
        this.onAfkStarted = action;
    }

    /**
     * How long this player's current AFK session has run, or 0 when they are not AFK.
     *
     * A memory read of two longs, which is what lets a placeholder and a menu both ask for it.
     */
    public long sessionMillis(UUID uuid) {
        AfkSnapshot snapshot = afk.get(uuid);
        return snapshot == null || snapshot.isSettled() ? 0L : snapshot.afkMillis();
    }

    public AfkSettings settings() {
        return settings;
    }

    public boolean isAfk(UUID uuid) {
        return afk.containsKey(uuid);
    }

    public Optional<AfkSnapshot> snapshotOf(UUID uuid) {
        return Optional.ofNullable(afk.get(uuid));
    }

    public int afkCount() {
        return afk.size();
    }

    /** Milliseconds since this player last did anything, or 0 when they are not tracked. */
    public long idleMillis(UUID uuid) {
        Long seen = lastActive.get(uuid);
        return seen == null ? 0L : System.currentTimeMillis() - seen;
    }

    /**
     * Records activity, and brings the player back if they were AFK.
     *
     * The hot path. It does no work beyond a map write unless the player is actually AFK.
     *
     * <h2>The settle window</h2>
     *
     * Going AFK is itself movement. {@link #enter} records the snapshot and then teleports, and that
     * teleport fires {@code PlayerMoveEvent} — which arrives back here with the player already in the
     * AFK map, so the auto-return fires and puts them straight back where they came from. `/afk`
     * appeared to enable and disable in the same tick, and the timeout sweep never held anybody
     * either.
     *
     * Activity is therefore ignored for {@link AfkSettings#settleMillis()} after entering. It has to
     * be a window rather than a flag cleared by the first move: a teleport can produce more than one
     * move event, and a player landing in the lobby may slide or fall a short distance before coming
     * to rest.
     */
    public void touch(UUID uuid) {
        lastActive.put(uuid, System.currentTimeMillis());

        AfkSnapshot snapshot = afk.get(uuid);

        if (snapshot == null || !settings.autoReturn()) {
            return;
        }

        if (snapshot.afkMillis() < settings.settleMillis()) {
            return;
        }

        Player player = plugin.getServer().getPlayer(uuid);
        if (player != null) {
            // Scheduled rather than run inline: this is called from inside event handlers, and
            // teleporting a player while Bukkit dispatches their own move event desynchronises
            // the client.
            plugin.getServer().getScheduler().runTask(plugin, () -> leave(player));
        }
    }

    /** Starts tracking a player who has joined, restoring them if they logged out AFK. */
    public void track(Player player) {
        UUID uuid = player.getUniqueId();
        lastActive.put(uuid, System.currentTimeMillis());

        if (!afk.containsKey(uuid)) {
            return;
        }

        // They disconnected in the lobby. Put them back before anything else, so the first thing
        // they see is where they actually were.
        plugin.getServer().getScheduler().runTask(plugin, () -> leave(player));
    }

    /**
     * Handles a disconnect: settles the session, keeps the location.
     *
     * The two halves of an AFK snapshot part company here. The *session* ends — this is the last
     * moment anything can be credited to a player who is leaving, so it is settled now, in one
     * request, exactly as returning from AFK would have done. The *location* does not: they logged
     * out standing in the AFK world, and the snapshot remains the only record of where they really
     * were, so it is kept and honoured on their next join. The settled marker is what keeps that
     * restore from paying for the same minutes a second time.
     *
     * @param username needed because the API records the name against the session and the player
     *                 object is about to stop being safe to touch
     */
    public void forget(UUID uuid, String username) {
        lastActive.remove(uuid);

        AfkSnapshot snapshot = afk.get(uuid);

        if (snapshot != null) {
            afk.put(uuid, settle(uuid, username, snapshot, false));
            save();

            // They are gone, so nobody should still be hiding on their account.
            refreshVisibility.run();
        }

        // Last, and after the settlement above rather than before it: settling reads the cached
        // totals to move them forward, and dropping them first would leave that write with nothing
        // to build on.
        rewards.forget(uuid);
    }

    /**
     * Pays for one session, once.
     *
     * Every route out of AFK funnels through here, which is what makes "settled exactly once" a
     * property of the code rather than a rule three call sites have to remember. A snapshot that has
     * already been paid is returned untouched.
     *
     * @return the snapshot, marked settled
     */
    private AfkSnapshot settle(UUID uuid, String username, AfkSnapshot snapshot, boolean stopping) {
        if (snapshot.isSettled()) {
            return snapshot;
        }

        long now = System.currentTimeMillis();
        rewards.settle(uuid, username, snapshot.afkMillis(), snapshot.enteredAt(), stopping);
        return snapshot.settle(now);
    }

    /** One sweep. Moves everyone idle past the timeout. Main thread: it teleports. */
    public void sweep() {
        if (!settings.enabled()) {
            return;
        }

        long timeout = settings.timeoutMillis();
        long now = System.currentTimeMillis();

        for (Player player : plugin.getServer().getOnlinePlayers()) {
            UUID uuid = player.getUniqueId();

            if (afk.containsKey(uuid) || exempt.test(uuid)) {
                continue;
            }

            Long seen = lastActive.get(uuid);
            if (seen == null) {
                lastActive.put(uuid, now);
                continue;
            }

            if (now - seen >= timeout) {
                enter(player, false);
            }
        }
    }

    /**
     * Moves a player to the AFK lobby.
     *
     * @param voluntary true when they asked for it with `/afk`
     * @return false when nothing happened — no lobby, already AFK, or a listener vetoed
     */
    public boolean enter(Player player, boolean voluntary) {
        UUID uuid = player.getUniqueId();

        if (afk.containsKey(uuid)) {
            return false;
        }

        // The AFK world's spawn, or the exact spot `/afk setlobby` recorded. Resolved per attempt
        // rather than held, so a world loaded after startup is picked up without a reload.
        Location lobby = settings.destination();
        if (lobby == null) {
            if (voluntary) {
                player.sendMessage(messages.prefixed("afk.no-lobby"));
            } else {
                plugin.getLogger().fine("No AFK world or lobby configured — nobody will be moved.");
            }
            return false;
        }

        PlayerEnterAFKEvent event = new PlayerEnterAFKEvent(player, voluntary);
        plugin.getServer().getPluginManager().callEvent(event);
        if (event.isCancelled()) {
            // Reset the clock, so a veto is not re-decided on every subsequent sweep.
            lastActive.put(uuid, System.currentTimeMillis());
            return false;
        }

        AfkSnapshot snapshot = AfkSnapshot.capture(player);

        // Recorded before the teleport. If the teleport fails the player has not moved and the
        // snapshot is discarded; the reverse order could leave them in the lobby with nothing
        // saying where they came from.
        afk.put(uuid, snapshot);
        detach(player);

        if (!player.teleport(lobby)) {
            afk.remove(uuid);
            plugin.getLogger().warning("Could not teleport " + player.getName() + " to the AFK lobby.");
            return false;
        }

        save();

        // After the teleport, so the pass sees the player already standing in the AFK world and
        // hides them in the same tick they arrive rather than a moment later.
        refreshVisibility.run();

        // Starts the overlay loop if this is the first player to go AFK. Idempotent, so the second
        // and every subsequent player cost nothing.
        onAfkStarted.run();

        play(player, settings.enterSound());
        player.sendMessage(messages.prefixed("afk.enter"));
        return true;
    }

    /**
     * Puts a player back where they were.
     *
     * @return false when they were not AFK, or their saved world is gone
     */
    public boolean leave(Player player) {
        return leave(player, false);
    }

    /**
     * Puts a player back where they were, settling what the session earned on the way.
     *
     * @param stopping true when the server is shutting down, which decides how the settlement
     *                 travels — see {@link AfkRewardService#settle}
     * @return false when they were not AFK, or their saved world is gone
     */
    public boolean leave(Player player, boolean stopping) {
        UUID uuid = player.getUniqueId();

        AfkSnapshot snapshot = afk.remove(uuid);
        if (snapshot == null) {
            return false;
        }

        // Before the teleport and before anything that can fail below: the minutes were earned
        // whether or not the world they came from still exists, and a settlement skipped because a
        // restore went wrong is a player who was never paid for time they really spent.
        settle(uuid, player.getName(), snapshot, stopping);

        lastActive.put(uuid, System.currentTimeMillis());
        save();

        // Everyone becomes visible to them, and they to everyone, the moment they stop being AFK.
        refreshVisibility.run();

        Location target = snapshot.location();
        if (target == null) {
            // The world went away while they stood in the lobby. Said plainly, rather than
            // teleporting them somewhere arbitrary and leaving them to work out what happened.
            player.sendMessage(messages.prefixed("afk.world-gone", "world", snapshot.worldName()));
            plugin.getLogger().warning("Could not restore " + player.getName()
                    + ": world \"" + snapshot.worldName() + "\" is not loaded.");
            plugin.getServer().getPluginManager().callEvent(
                    new PlayerLeaveAFKEvent(player, null, snapshot.afkMillis()));
            return false;
        }

        detach(player);

        if (!player.teleport(target)) {
            plugin.getLogger().warning("Could not teleport " + player.getName() + " back from AFK.");
            return false;
        }

        player.setGameMode(snapshot.gameMode());
        // Order matters: flight cannot be enabled on a player not allowed to fly, and a survival
        // player legitimately has allowFlight false.
        player.setAllowFlight(snapshot.allowFlight());
        if (snapshot.allowFlight()) {
            player.setFlying(snapshot.flying());
        }

        play(player, settings.leaveSound());
        player.sendMessage(messages.prefixed("afk.leave"));

        plugin.getServer().getPluginManager().callEvent(
                new PlayerLeaveAFKEvent(player, target, snapshot.afkMillis()));
        return true;
    }

    /**
     * Clears AFK state without teleporting.
     *
     * For when something with a better claim has already moved them — a death and respawn, chiefly.
     * Restoring afterwards would drag them out of their bed and back to where they died.
     */
    public void abandon(Player player) {
        UUID uuid = player.getUniqueId();
        AfkSnapshot snapshot = afk.remove(uuid);

        if (snapshot == null) {
            return;
        }

        // The teleport is abandoned; the time is not. They stood in the AFK world for those minutes
        // and dying there does not un-earn them.
        settle(uuid, player.getName(), snapshot, false);

        lastActive.put(uuid, System.currentTimeMillis());
        save();
        refreshVisibility.run();
    }

    /**
     * Detaches a player from anything that would follow them through a teleport, or block it.
     *
     * A vehicle carries its passenger, so teleporting without dismounting either drags the boat
     * along or silently fails; a sleeping player cannot be teleported at all.
     */
    private void detach(Player player) {
        if (player.isInsideVehicle()) {
            player.leaveVehicle();
        }
        if (player.isSleeping()) {
            player.wakeup(true);
        }
    }

    private void play(Player player, Sound sound) {
        if (sound != null) {
            player.playSound(player.getLocation(), sound, 1f, 1f);
        }
    }

    // --- Persistence ---------------------------------------------------------------------------

    /** Reads snapshots left by a previous run, so a restart mid-AFK strands nobody. */
    public void load() {
        if (!stateFile.exists()) {
            return;
        }

        YamlConfiguration document = YamlConfiguration.loadConfiguration(stateFile);
        ConfigurationSection root = document.getConfigurationSection("afk");
        if (root == null) {
            return;
        }

        List<String> dropped = new ArrayList<>();

        for (String key : root.getKeys(false)) {
            ConfigurationSection entry = root.getConfigurationSection(key);
            if (entry == null) {
                continue;
            }

            try {
                UUID uuid = UUID.fromString(key);
                AfkSnapshot snapshot = AfkSnapshot.read(uuid, entry);

                // A snapshot naming a deleted world can never be honoured, and keeping it would
                // leave the player permanently AFK with nowhere to return to.
                if (snapshot.isStale()) {
                    dropped.add(key);
                    continue;
                }

                afk.put(uuid, snapshot);
            } catch (IllegalArgumentException malformed) {
                dropped.add(key);
            }
        }

        if (!afk.isEmpty()) {
            plugin.getLogger().info("Restored " + afk.size() + " pending AFK location(s).");
        }
        if (!dropped.isEmpty()) {
            plugin.getLogger().warning("Discarded " + dropped.size()
                    + " AFK location(s) whose world no longer exists.");
            save();
        }
    }

    /**
     * Writes the snapshots to disk.
     *
     * On every transition rather than on a timer, because the case this exists for is an ungraceful
     * shutdown — and a timer is exactly what fails to run then.
     */
    public void save() {
        YamlConfiguration document = AfkSnapshot.emptyDocument();
        Map<UUID, AfkSnapshot> copy = new HashMap<>(afk);

        for (Map.Entry<UUID, AfkSnapshot> entry : copy.entrySet()) {
            entry.getValue().write(document.createSection("afk." + entry.getKey()));
        }

        try {
            document.save(stateFile);
        } catch (IOException error) {
            plugin.getLogger().log(Level.WARNING, "Could not save AFK state", error);
        }
    }

    /**
     * Restores everyone still AFK. Called on shutdown so nobody is saved inside the AFK world.
     *
     * Runs with the scheduler already cancelled, so every settlement it produces goes straight onto
     * the offline queue instead of being scheduled onto a worker that will never run — the queue is
     * saved immediately afterwards and replayed on the next start.
     */
    public void restoreAll() {
        for (UUID uuid : List.copyOf(afk.keySet())) {
            Player player = plugin.getServer().getPlayer(uuid);
            if (player != null) {
                leave(player, true);
            }
        }
        save();
    }
}
