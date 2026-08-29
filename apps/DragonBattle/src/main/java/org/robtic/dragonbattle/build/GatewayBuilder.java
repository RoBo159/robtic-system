package org.robtic.dragonbattle.build;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.robtic.dragonbattle.util.Particles;
import org.bukkit.Sound;
import org.bukkit.block.Block;
import org.bukkit.block.EndGateway;
import org.robtic.dragonbattle.battle.BattleContext;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.ArenaSettings;
import org.robtic.dragonbattle.model.StoredLocation;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Opens the end gateways a kill earns.
 *
 * <h2>Which positions are used is the arena's decision</h2>
 *
 * Vanilla places twenty around a fixed ring and opens one per kill. Here the positions are whatever
 * an operator configured — any number, anywhere — and the mode decides how they are consumed:
 *
 * <ul>
 *   <li>{@code SEQUENTIAL} — one per kill in order, wrapping. The closest to vanilla, and the one
 *       that rewards repeated fights with a new gateway each time.</li>
 *   <li>{@code RANDOM} — one per kill, chosen from those still unopened.</li>
 *   <li>{@code ALL} — every position at once, on the first kill.</li>
 * </ul>
 *
 * <h2>Exit locations are left unset on purpose</h2>
 *
 * A gateway with no exit behaves as vanilla's does: the server generates an outer-island
 * destination on first use. Setting one here would send every player on the server to the same
 * block, which is not what a gateway is for — and an operator who wants that can set it in the world
 * afterwards.
 */
public final class GatewayBuilder {

    /**
     * Opens whatever this kill has earned.
     *
     * @return the positions that were opened, which may be empty when none are configured
     */
    public List<StoredLocation> open(Arena arena, BattleContext context) {
        List<StoredLocation> configured = arena.gateways();

        if (configured.isEmpty()) {
            return List.of();
        }

        List<StoredLocation> chosen = choose(arena, context, configured);
        List<StoredLocation> opened = new ArrayList<>();

        for (StoredLocation position : chosen) {
            if (place(position)) {
                opened.add(position);
                context.gatewayOpened();
            }
        }

        return opened;
    }

    private List<StoredLocation> choose(Arena arena, BattleContext context, List<StoredLocation> configured) {
        ArenaSettings.GatewayMode mode = arena.settings().gatewayMode();

        return switch (mode) {
            case ALL -> configured;

            // Wraps rather than running out. A server whose players kill the dragon more times than
            // there are positions should keep getting gateways, not silently stop.
            case SEQUENTIAL -> List.of(configured.get(context.gatewaysOpened() % configured.size()));

            case RANDOM -> List.of(configured.get(ThreadLocalRandom.current().nextInt(configured.size())));
        };
    }

    /**
     * Places one gateway.
     *
     * The block is set first and its state read back second: a gateway's {@link EndGateway} tile
     * entity does not exist until the block does, so reading before writing gets null.
     */
    private boolean place(StoredLocation position) {
        Optional<Location> location = position.toBukkit();

        if (location.isEmpty()) {
            return false;
        }

        Location at = location.get().toBlockLocation();
        Block block = at.getBlock();

        block.setType(Material.END_GATEWAY, false);

        if (block.getState() instanceof EndGateway gateway) {
            // Age drives the beam vanilla plays when a gateway appears. Left at zero so the server
            // animates it exactly as it would its own.
            gateway.setAge(0L);
            gateway.update(true, false);
        }

        at.getWorld().playSound(at, Sound.BLOCK_END_GATEWAY_SPAWN, 1f, 1f);
        Particles.spawn(at.getWorld(), Particle.PORTAL, at.clone().add(0.5, 0.5, 0.5), 100, 0.5, 0.5, 0.5, 0.4);

        return true;
    }
}
