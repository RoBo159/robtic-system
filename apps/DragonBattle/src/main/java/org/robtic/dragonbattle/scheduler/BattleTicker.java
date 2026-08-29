package org.robtic.dragonbattle.scheduler;

import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitTask;
import org.robtic.dragonbattle.battle.BattleContext;
import org.robtic.dragonbattle.config.PluginSettings;
import org.robtic.dragonbattle.manager.BattleManager;

import java.util.logging.Level;

/**
 * The clock every running battle advances on.
 *
 * <h2>One task for every battle, not one each</h2>
 *
 * A task per arena would mean a server with six arenas running six schedulers whose interleaving
 * nobody controls. One task iterating the running battles keeps the order deterministic and the cost
 * proportional to how many fights are actually happening — which is usually zero.
 *
 * <h2>Main thread, deliberately</h2>
 *
 * Everything a tick does touches entities, blocks or players. There is nothing here worth moving to
 * a worker, and doing so would make every one of those touches illegal.
 *
 * <h2>A failing battle does not stop the others</h2>
 *
 * An exception out of one arena's tick is caught, logged with the arena's name, and the loop
 * continues. Bukkit would otherwise cancel the whole repeating task on the first throw, silently
 * freezing every other fight on the server.
 */
public final class BattleTicker {

    private final Plugin plugin;
    private final BattleManager battles;
    private final PluginSettings settings;

    private BukkitTask task;

    public BattleTicker(Plugin plugin, BattleManager battles, PluginSettings settings) {
        this.plugin = plugin;
        this.battles = battles;
        this.settings = settings;
    }

    public void start() {
        stop();

        long interval = settings.tickInterval();

        task = plugin.getServer().getScheduler().runTaskTimer(plugin, this::tick, interval, interval);
    }

    public void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
    }

    private void tick() {
        long now = plugin.getServer().getCurrentTick();

        for (BattleContext context : battles.running()) {
            try {
                battles.tick(context, now);
            } catch (RuntimeException error) {
                plugin.getLogger().log(Level.SEVERE,
                        "The battle in arena \"" + context.arena().name() + "\" threw while ticking. "
                                + "Every other battle is still running.", error);
            }
        }
    }
}
