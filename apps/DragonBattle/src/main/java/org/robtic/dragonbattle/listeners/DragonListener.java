package org.robtic.dragonbattle.listeners;

import org.bukkit.entity.EnderDragon;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.EntityExplodeEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.dragonbattle.battle.BattleContext;
import org.robtic.dragonbattle.manager.BattleManager;
import org.robtic.dragonbattle.model.Arena;

import java.util.Optional;

/**
 * The dragon's own events: dying, and breaking things.
 *
 * <h2>Only this plugin's dragons</h2>
 *
 * Every handler resolves the entity back to a running battle first, so a dragon spawned by anything
 * else — a creative-mode admin, another plugin, a naturally generated End — is left entirely alone.
 * A plugin that governed every dragon on the server would be a plugin that broke the vanilla End.
 */
public final class DragonListener implements Listener {

    private final Plugin plugin;
    private final BattleManager battles;

    public DragonListener(Plugin plugin, BattleManager battles) {
        this.plugin = plugin;
        this.battles = battles;
    }

    /**
     * The dragon died.
     *
     * MONITOR, because this observes rather than decides: the drops, the experience and the death
     * message are all somebody else's business, and the battle only needs to know it happened.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onDeath(EntityDeathEvent event) {
        if (!(event.getEntity() instanceof EnderDragon dragon)) {
            return;
        }

        battleFor(dragon).ifPresent(context ->
                battles.onDragonDeath(context, plugin.getServer().getCurrentTick()));
    }

    /**
     * The dragon tried to break blocks.
     *
     * Filtered block by block rather than cancelled wholesale, so a single protected build inside an
     * otherwise destructible arena costs the rest of the arena nothing. The explosion still happens
     * — players are still thrown, the sound still plays — only the block changes are removed.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onExplode(EntityExplodeEvent event) {
        if (!(event.getEntity() instanceof EnderDragon dragon)) {
            return;
        }

        Optional<BattleContext> context = battleFor(dragon);

        if (context.isEmpty()) {
            return;
        }

        Arena arena = context.get().arena();

        if (!arena.settings().allowBlockDamage()) {
            event.blockList().clear();
            return;
        }

        // A perch marked safe suppresses destruction entirely while the dragon sits on it, so a
        // landing spot in the middle of a build is usable without the dragon dismantling it.
        if (context.get().currentPerch().map(perch -> perch.safe()).orElse(false)) {
            event.blockList().clear();
            return;
        }

        // Everything else is decided per block by who put it there.
        //
        // Outside the arena nothing is ever breakable — the dragon should not be there at all, and a
        // block beyond the bounds is by definition not part of the fight.
        event.blockList().removeIf(block ->
                !arena.inside(block.getLocation()) || !arena.builds().mayBreak(block));
    }

    /** The battle this dragon belongs to, or empty when it is not one of ours. */
    private Optional<BattleContext> battleFor(EnderDragon dragon) {
        return battles.running().stream()
                .filter(context -> context.dragonId()
                        .map(id -> id.equals(dragon.getUniqueId()))
                        .orElse(false))
                .findFirst();
    }
}
