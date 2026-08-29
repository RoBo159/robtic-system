package org.robtic.dragonbattle.dragon;

import org.bukkit.Location;
import org.bukkit.entity.EnderCrystal;
import org.bukkit.entity.EnderDragon;
import org.robtic.dragonbattle.model.Arena;

import java.util.ArrayList;
import java.util.List;

/**
 * Crystals inside the arena heal the dragon, as they do in vanilla.
 *
 * <h2>Why this has to be implemented rather than inherited</h2>
 *
 * Vanilla's healing belongs to its {@code DragonBattle} object — the one thing this plugin is
 * required not to touch. A dragon spawned outside that system has no battle attached, so nothing
 * heals it and nothing draws the beams, which is why crystals appeared to do nothing.
 *
 * The mechanic itself is small: find live crystals near the dragon, point them at it, and give back
 * a little health per tick. Doing it here also makes it configurable and arena-scoped, neither of
 * which vanilla's version is.
 *
 * <h2>Why it matters to the fight</h2>
 *
 * Without healing there is no reason to break the crystals, and the crystals are what turn the fight
 * from "hit the dragon" into "clear the arena first". That loop is most of what makes the vanilla
 * fight interesting, so it is worth reproducing properly.
 */
public final class CrystalHealing {

    /** How far a crystal reaches. Vanilla's is effectively the whole End; an arena is smaller. */
    private final double range;

    /** Health restored per healing tick, before the tick interval is considered. */
    private final double amountPerTick;

    private final boolean enabled;

    public CrystalHealing(boolean enabled, double range, double amountPerTick) {
        this.enabled = enabled;
        this.range = Math.max(1.0d, range);
        this.amountPerTick = Math.max(0.0d, amountPerTick);
    }

    public boolean enabled() {
        return enabled;
    }

    /**
     * One healing tick.
     *
     * @return how many crystals are currently healing, so a caller can show it or log it
     */
    public int tick(EnderDragon dragon, Arena arena) {
        if (!enabled || dragon.isDead() || amountPerTick <= 0.0d) {
            return 0;
        }

        List<EnderCrystal> healers = healersFor(dragon, arena);

        if (healers.isEmpty()) {
            return 0;
        }

        Location dragonHead = dragon.getLocation().add(0, 3, 0);

        for (EnderCrystal crystal : healers) {
            // The beam is what tells a player which crystal is doing it — without it the dragon just
            // appears not to be taking damage, which reads as a bug rather than as a mechanic.
            crystal.setBeamTarget(dragonHead);
        }

        double max = dragon.getAttribute(org.bukkit.attribute.Attribute.MAX_HEALTH) != null
                ? dragon.getAttribute(org.bukkit.attribute.Attribute.MAX_HEALTH).getValue()
                : dragon.getHealth();

        // Scaled by how many crystals are alive, so clearing them is progress a player can feel
        // rather than an all-or-nothing switch at the last one.
        double healed = amountPerTick * healers.size();

        dragon.setHealth(Math.min(max, dragon.getHealth() + healed));

        return healers.size();
    }

    /** Live crystals in the arena and within range of the dragon. */
    private List<EnderCrystal> healersFor(EnderDragon dragon, Arena arena) {
        List<EnderCrystal> healers = new ArrayList<>();

        for (org.bukkit.entity.Entity entity :
                dragon.getWorld().getNearbyEntities(dragon.getLocation(), range, range, range)) {

            if (!(entity instanceof EnderCrystal crystal) || !crystal.isValid()) {
                continue;
            }

            // Confined to the arena, so a crystal a player placed outside the boundary cannot heal a
            // dragon they are supposed to be fighting inside it.
            if (arena.bounds().isPresent() && !arena.over(crystal.getLocation())) {
                continue;
            }

            healers.add(crystal);
        }

        return healers;
    }

    /**
     * Stops every crystal in the arena beaming.
     *
     * Called when the dragon dies. A beam pointing at where a dragon used to be persists on the
     * client until something changes it.
     */
    public void clearBeams(org.bukkit.World world, Location around) {
        if (world == null || around == null) {
            return;
        }

        for (org.bukkit.entity.Entity entity :
                world.getNearbyEntities(around, range * 2, range * 2, range * 2)) {

            if (entity instanceof EnderCrystal crystal && crystal.isValid()) {
                crystal.setBeamTarget(null);
            }
        }
    }
}
