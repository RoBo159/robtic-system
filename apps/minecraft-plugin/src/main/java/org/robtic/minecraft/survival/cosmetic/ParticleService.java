package org.robtic.minecraft.survival.cosmetic;

import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.survival.SurvivalCacheService;

import java.util.List;
import java.util.Locale;

/**
 * Draws each premium player's chosen particle.
 *
 * <h2>One task for the whole server</h2>
 *
 * A timer per player would mean a scheduled task per connection; instead one repeating task walks
 * the online list. Each player's selection is read from the cosmetics cache, which is a memory
 * lookup, so a full server costs one pass and no requests at all.
 *
 * The task is the reason the cosmetics cache has no TTL: it runs continuously, and a cache that
 * expired underneath it would turn a decoration into a steady stream of API calls.
 */
public final class ParticleService {

    /** Particles a player may pick. Kept to ambient, low-density effects that will not blind anyone. */
    public static final List<String> AVAILABLE = List.of(
            "FLAME",
            "HEART",
            "HAPPY_VILLAGER",
            "SOUL_FIRE_FLAME",
            "END_ROD",
            "DRAGON_BREATH",
            "TOTEM_OF_UNDYING",
            "COMPOSTER",
            "CRIT",
            "ENCHANT");

    /** How often the trail is drawn. 10 ticks is smooth enough without being a per-tick cost. */
    private static final long INTERVAL_TICKS = 10L;

    /** Kept small deliberately: this runs for every premium player on every pass. */
    private static final int COUNT = 3;

    private final Plugin plugin;
    private final SurvivalCacheService cache;

    private int taskId = -1;

    public ParticleService(Plugin plugin, SurvivalCacheService cache) {
        this.plugin = plugin;
        this.cache = cache;
    }

    /** Starts the single server-wide task. Main thread: spawning particles is not thread-safe. */
    public void start() {
        if (taskId != -1) {
            return;
        }

        taskId = plugin.getServer().getScheduler().runTaskTimer(plugin, this::tick, INTERVAL_TICKS, INTERVAL_TICKS).getTaskId();
    }

    public void stop() {
        if (taskId != -1) {
            plugin.getServer().getScheduler().cancelTask(taskId);
            taskId = -1;
        }
    }

    private void tick() {
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            String selected = cache.cachedSettings(player.getUniqueId()).particle();

            if (selected == null || selected.isBlank()) {
                continue;
            }

            resolve(selected).ifPresent(particle -> draw(player, particle));
        }
    }

    private void draw(Player player, Particle particle) {
        Location at = player.getLocation().add(0, 0.2, 0);
        player.getWorld().spawnParticle(particle, at, COUNT, 0.3, 0.1, 0.3, 0.0);
    }

    /**
     * The Bukkit particle for a stored name.
     *
     * Unknown names are ignored rather than thrown: the list of particles changes between Minecraft
     * versions, and a selection made on an older server must not break the whole tick loop.
     */
    public static java.util.Optional<Particle> resolve(String name) {
        try {
            return java.util.Optional.of(Particle.valueOf(name.toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException unknown) {
            return java.util.Optional.empty();
        }
    }
}
