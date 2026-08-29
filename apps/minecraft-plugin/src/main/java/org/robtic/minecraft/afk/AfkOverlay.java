package org.robtic.minecraft.afk;

import net.kyori.adventure.text.Component;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitTask;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.util.Durations;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The status line an AFK player sees above their hotbar.
 *
 * <h2>The number is derived, not accumulated</h2>
 *
 * The counter shows what {@link AfkRewardService#projectedRobs} says the session is worth right now,
 * computed from {@code now - start}. It is deliberately <em>not</em> a running total this class adds
 * to every second.
 *
 * Those two would look identical for about a minute and then drift, because a counter incremented on
 * a timer accumulates every skipped tick, every lag spike and every rounding step — and the moment it
 * disagreed with the figure actually paid on leaving AFK, the overlay would be lying to the player
 * about their own earnings. Deriving both from the same function makes that impossible: the number on
 * screen is the number that gets paid.
 *
 * It also keeps the promise the AFK system was built on — nothing periodic modifies a value, and
 * nothing is written to the database while a player stands still.
 *
 * <h2>One task, not one per player</h2>
 *
 * A task per AFK player would be a scheduler entry per idle person on the server. One task iterating
 * the AFK players costs the same for the first and nothing extra for the rest — and it stops itself
 * when nobody is AFK, so an empty server schedules nothing at all.
 *
 * <h2>Why it resends every second</h2>
 *
 * The action bar is transient: the client fades it after roughly three seconds whatever the server
 * does. Resending on the same cadence the counter updates on is therefore the minimum to keep it on
 * screen, not packet spam — and it is why "only update when the value changes" cannot apply here.
 */
public final class AfkOverlay {

    private final Plugin plugin;
    private final AfkService afk;
    private final AfkRewardService rewards;
    private final MessageCatalog messages;

    /** Players currently being shown the overlay, so it can be cleared exactly once on exit. */
    private final Set<UUID> showing = ConcurrentHashMap.newKeySet();

    private BukkitTask task;

    public AfkOverlay(Plugin plugin, AfkService afk, AfkRewardService rewards, MessageCatalog messages) {
        this.plugin = plugin;
        this.afk = afk;
        this.rewards = rewards;
        this.messages = messages;
    }

    /**
     * Starts the refresh loop if it is not already running.
     *
     * Called when somebody goes AFK. Idempotent, because the second player to go AFK must not start
     * a second task.
     */
    public void start() {
        if (task != null || !afk.settings().overlayEnabled()) {
            return;
        }

        long interval = afk.settings().overlayIntervalTicks();

        task = plugin.getServer().getScheduler().runTaskTimer(plugin, this::tick, interval, interval);
    }

    /** Stops the loop and clears every overlay. Called on shutdown. */
    public void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }

        for (UUID uuid : Set.copyOf(showing)) {
            clear(uuid);
        }
    }

    /**
     * One pass: refresh everyone who is AFK, clear anyone who no longer is.
     *
     * The AFK set is the authority rather than an enter/leave callback. A player can stop being AFK
     * by dying, disconnecting, being teleported by staff or the server shutting down, and a listener
     * for each of those is a listener that can be forgotten — asking the question every second cannot
     * miss a case.
     */
    private void tick() {
        if (afk.afkCount() == 0 && showing.isEmpty()) {
            // Nobody is AFK and nothing is on screen. The loop stops rather than idling, and the
            // next player to go AFK starts it again.
            stop();
            return;
        }

        for (Player player : plugin.getServer().getOnlinePlayers()) {
            UUID uuid = player.getUniqueId();

            if (afk.isAfk(uuid)) {
                render(player);
                showing.add(uuid);
            } else if (showing.remove(uuid)) {
                clearFor(player);
            }
        }

        // Players who went offline while AFK never reach the loop above, so their entry is dropped
        // here rather than being held until the server restarts.
        showing.removeIf(uuid -> plugin.getServer().getPlayer(uuid) == null);
    }

    /** Builds and sends one player's line. */
    private void render(Player player) {
        UUID uuid = player.getUniqueId();

        long sessionMillis = afk.sessionMillis(uuid);

        // The same call the payout uses. See the class note on why this is derived rather than
        // counted: what is displayed and what is credited are the same function of the same clock.
        double robs = rewards.projectedRobs(sessionMillis);

        player.sendActionBar(messages.component("afk.overlay",
                "time", Durations.compact(sessionMillis),
                "robs", org.robtic.minecraft.util.Robs.format(robs),
                "total", org.robtic.minecraft.util.Robs.format(
                        org.robtic.minecraft.util.Robs.add(rewards.statistics(uuid).totalRobs(), robs))));
    }

    /** Removes the overlay by sending an empty line, which the client fades out on its own. */
    private void clearFor(Player player) {
        player.sendActionBar(Component.empty());
    }

    private void clear(UUID uuid) {
        showing.remove(uuid);

        Player player = plugin.getServer().getPlayer(uuid);
        if (player != null) {
            clearFor(player);
        }
    }

    /** Drops a departed player's entry, so the set does not grow with the player list. */
    public void forget(UUID uuid) {
        showing.remove(uuid);
    }
}
