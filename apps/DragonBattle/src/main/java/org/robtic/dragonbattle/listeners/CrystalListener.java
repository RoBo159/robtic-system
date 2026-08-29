package org.robtic.dragonbattle.listeners;

import org.bukkit.entity.EnderCrystal;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntitySpawnEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.dragonbattle.battle.BattleState;
import org.robtic.dragonbattle.config.MessageCatalog;
import org.robtic.dragonbattle.manager.ArenaManager;
import org.robtic.dragonbattle.manager.BattleManager;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.ritual.RitualController;

/**
 * Watches for the crystals that start a ritual.
 *
 * <h2>Checked one tick late, on purpose</h2>
 *
 * The spawn event fires <em>before</em> the crystal exists as far as a nearby-entity search is
 * concerned, so asking "are all positions filled?" during the event always misses the crystal that
 * just triggered it — and the last crystal placed would never complete the ritual. Deferring by a
 * tick means the check sees the world as the player does.
 */
public final class CrystalListener implements Listener {

    private final Plugin plugin;
    private final ArenaManager arenas;
    private final BattleManager battles;
    private final RitualController ritual;
    private final MessageCatalog messages;

    public CrystalListener(
            Plugin plugin,
            ArenaManager arenas,
            BattleManager battles,
            RitualController ritual,
            MessageCatalog messages
    ) {
        this.plugin = plugin;
        this.arenas = arenas;
        this.battles = battles;
        this.ritual = ritual;
        this.messages = messages;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onSpawn(EntitySpawnEvent event) {
        if (!(event.getEntity() instanceof EnderCrystal crystal)) {
            return;
        }

        plugin.getServer().getScheduler().runTask(plugin, () -> check(crystal));
    }

    private void check(EnderCrystal crystal) {
        if (!crystal.isValid()) {
            return;
        }

        for (Arena arena : arenas.all()) {
            // The lock: no ritual may complete while a dragon is alive in that arena.
            if (!battles.ritualAllowed(arena)) {
                continue;
            }

            // Only arenas whose world this crystal is actually in, so a crystal placed in the
            // overworld cannot complete an End arena's ritual by coincidence of coordinates.
            boolean sameWorld = arena.crystals().stream()
                    .anyMatch(position -> position.world().equals(crystal.getWorld().getName()));

            if (!sameWorld || !ritual.complete(arena)) {
                continue;
            }

            begin(arena, crystal);
            return;
        }
    }

    private void begin(Arena arena, EnderCrystal trigger) {
        long now = plugin.getServer().getCurrentTick();

        battles.start(arena, now).ifPresentOrElse(
                problem -> plugin.getLogger().fine(
                        "The ritual in \"" + arena.name() + "\" completed but the battle did not start: " + problem),
                () -> announce(arena, trigger));
    }

    private void announce(Arena arena, EnderCrystal trigger) {
        battles.battle(arena).ifPresent(context ->
                battles.transition(context, BattleState.CRYSTALS_PLACED, plugin.getServer().getCurrentTick()));

        for (Player player : trigger.getWorld().getPlayers()) {
            player.sendMessage(messages.prefixed("ritual.started", "arena", arena.name()));
        }
    }
}
