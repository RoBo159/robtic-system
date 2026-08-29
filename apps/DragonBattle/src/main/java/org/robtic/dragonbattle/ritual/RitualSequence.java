package org.robtic.dragonbattle.ritual;

import org.bukkit.entity.EnderCrystal;
import org.bukkit.plugin.Plugin;
import org.robtic.dragonbattle.model.Arena;

import java.util.List;
import java.util.logging.Level;

/**
 * What the ritual actually does: consumes the crystals when it ends.
 *
 * <h2>This used to be an animation, and no longer is</h2>
 *
 * {@code RitualAnimation} drew beams, particles and sound for the respawn. All of that is CS
 * Cinematic's job now — the plugin triggers a cinematic at {@code ritual_start} and implements no
 * camera or effect logic of its own.
 *
 * What could not go with it is the part that was never presentation: the crystals have to stop
 * pointing at the spawn and then be removed or kept, and that decides whether the arena can run
 * another fight. Deleting the whole class would have left every ritual's crystals standing with live
 * beams forever, which is a gameplay fault dressed up as a missing cutscene.
 *
 * So this is the residue: one timer, no drawing.
 *
 * <h2>Presentation must never stall the sequence</h2>
 *
 * The old version advanced its clock at the end of the tick body, and a particle call above it threw
 * on every pass — so the counter never moved, the crystals were never consumed, and the arena could
 * never spawn another dragon. There is nothing left here that can throw, but the ordering is kept
 * anyway: the work is scheduled once, for a fixed delay, rather than counted up tick by tick.
 */
public final class RitualSequence {

    private final Plugin plugin;
    private final RitualController ritual;

    /**
     * Whether the crystals survive the ritual.
     *
     * A supplier rather than a value, so a reloaded config takes effect on the next ritual without
     * this object being rebuilt.
     */
    private final java.util.function.BooleanSupplier keepCrystals;

    public RitualSequence(
            Plugin plugin,
            RitualController ritual,
            java.util.function.BooleanSupplier keepCrystals
    ) {
        this.plugin = plugin;
        this.ritual = ritual;
        this.keepCrystals = keepCrystals;
    }

    /**
     * Schedules the crystals to be consumed when the ritual ends.
     *
     * @param durationTicks how long the ritual lasts. The caller owns the timing, because the state
     *                      machine is what decides when the dragon appears — this only has to be
     *                      finished by then
     */
    public void play(Arena arena, long durationTicks) {
        List<EnderCrystal> crystals = ritual.crystalsOn(arena);

        if (crystals.isEmpty()) {
            return;
        }

        plugin.getServer().getScheduler().runTaskLater(plugin,
                () -> consume(crystals), Math.max(1L, durationTicks));
    }

    /**
     * Ends the ritual by clearing the beams and removing the crystals.
     *
     * Removed rather than exploded: an explosion would damage the arena the operator built, and would
     * be the one part of this sequence with a lasting effect on the world.
     */
    private void consume(List<EnderCrystal> crystals) {
        boolean keep = keepCrystals.getAsBoolean();

        for (EnderCrystal crystal : crystals) {
            try {
                if (!crystal.isValid()) {
                    continue;
                }

                // Cleared either way, and that is what actually ends the ritual visually. A beam
                // target set on an entity removed in the same tick can persist on the client, so a
                // crystal that is kept and one that is removed both have to be told to stop first.
                crystal.setBeamTarget(null);

                if (keep) {
                    // Left standing to heal the dragon, which is vanilla's loop: the crystals that
                    // summoned it are the ones that keep it alive, and breaking them is how the
                    // fight is won. See CrystalHealing.
                    continue;
                }

                crystal.remove();
            } catch (RuntimeException failure) {
                // One crystal in an unloaded chunk must not stop the others being dealt with.
                plugin.getLogger().log(Level.FINE, "Could not consume a ritual crystal", failure);
            }
        }
    }
}
