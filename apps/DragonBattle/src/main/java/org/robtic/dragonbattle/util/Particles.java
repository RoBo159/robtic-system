package org.robtic.dragonbattle.util;

import org.bukkit.Color;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.World;
import org.bukkit.inventory.ItemStack;

/**
 * Spawns particles without caring what data the running server thinks they need.
 *
 * <h2>Why this exists</h2>
 *
 * {@code World#spawnParticle} without a data argument throws
 * {@code IllegalArgumentException: missing required data} for any particle whose type requires one —
 * and which particles those are <em>changes between Minecraft versions</em>. A plugin compiled
 * against one Paper version and run on a later one can therefore crash on a call that was correct
 * when it was written.
 *
 * That is exactly what happened here: {@code DRAGON_BREATH} needed no data on 1.21.7 and needs a
 * {@link Float} on 1.21.11, so the ritual animation threw on every tick of every respawn.
 *
 * <h2>Why it was worse than a cosmetic failure</h2>
 *
 * The throw happened inside a repeating task, before the line that advanced its counter. The counter
 * never advanced, so the animation never finished, so the crystals were never consumed and the state
 * machine never left RESPAWN_ANIMATION — one unrelated particle call left the arena unable to ever
 * spawn another dragon. A cosmetic call should not be able to do that, which is the second reason
 * this class exists: {@link #spawn} never throws.
 *
 * <h2>How it decides</h2>
 *
 * {@link Particle#getDataType()} is asked at runtime, so the answer always matches the server the
 * plugin is actually running on rather than the one it was compiled against.
 */
public final class Particles {

    private Particles() {
    }

    /**
     * Spawns a particle, supplying whatever data the server requires for it.
     *
     * @param extra particle speed, as the Bukkit overload means it
     */
    public static void spawn(
            World world,
            Particle particle,
            Location at,
            int count,
            double offsetX,
            double offsetY,
            double offsetZ,
            double extra
    ) {
        if (world == null || particle == null || at == null) {
            return;
        }

        try {
            Class<?> required = particle.getDataType();

            // Void means "no data", which is the common case and the cheap path.
            if (required == null || required == Void.class) {
                world.spawnParticle(particle, at, count, offsetX, offsetY, offsetZ, extra);
                return;
            }

            world.spawnParticle(particle, at, count, offsetX, offsetY, offsetZ, extra,
                    defaultData(required));
        } catch (RuntimeException | LinkageError failure) {
            // Never propagates. Every caller is decoration inside a task that has real work to do
            // afterwards, and this class exists because one such throw stopped a battle dead.
            //
            // Silent rather than logged: this runs several times a second during an animation, and a
            // warning per call would bury the console faster than the original exception did.
        }
    }

    /** Convenience for the common single-point burst. */
    public static void spawn(World world, Particle particle, Location at, int count) {
        spawn(world, particle, at, count, 0, 0, 0, 0);
    }

    /**
     * A harmless value of whatever type the particle wants.
     *
     * The specific values barely matter — these are decorative bursts, and a particle that renders
     * with a default colour is indistinguishable from one that renders correctly to anybody not
     * looking for it. What matters is that the call succeeds.
     */
    private static Object defaultData(Class<?> required) {
        if (required == Float.class) {
            // SCULK_CHARGE's roll angle, and whatever else adopts a float. Zero is upright.
            return 0f;
        }

        if (required == Integer.class) {
            return 0;
        }

        if (required == org.bukkit.block.data.BlockData.class) {
            return Material.STONE.createBlockData();
        }

        if (required == ItemStack.class) {
            return new ItemStack(Material.STONE);
        }

        if (required == Particle.DustOptions.class) {
            return new Particle.DustOptions(Color.WHITE, 1f);
        }

        if (required == Particle.DustTransition.class) {
            return new Particle.DustTransition(Color.WHITE, Color.GRAY, 1f);
        }

        if (required == Color.class) {
            return Color.WHITE;
        }

        if (required == org.bukkit.Vibration.class) {
            return null;
        }

        // An unrecognised requirement. Null makes spawnParticle throw, which the caller catches —
        // so an unknown particle type degrades to "no particle" rather than to a crash.
        return null;
    }
}
