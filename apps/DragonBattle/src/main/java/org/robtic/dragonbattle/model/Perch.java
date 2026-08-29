package org.robtic.dragonbattle.model;

import org.bukkit.configuration.ConfigurationSection;

/**
 * A place the dragon is allowed to land.
 *
 * <h2>Landing is a whitelist, never a search</h2>
 *
 * Vanilla lands the dragon on the portal and nowhere else; a dragon that picked its own ground would
 * come to rest inside somebody's build, on a roof, or somewhere players cannot reach it. So the
 * dragon only ever lands on a perch an operator placed, and if none qualifies it keeps flying. That
 * is the whole design of the landing system and the reason this type exists.
 *
 * @param stayTicks  how long the dragon sits here before taking off again
 * @param cooldownTicks how long this perch is unavailable after being used, so a battle does not
 *                      settle into the same spot repeatedly
 * @param weight     relative likelihood of being chosen among eligible perches. Higher is more
 *                   likely; zero excludes the perch without deleting it, which is how an operator
 *                   disables one temporarily
 * @param radius     how close a player must be for this perch to count as "near" them, used by the
 *                   player-targeted landing mode
 */
public record Perch(
        String id,
        StoredLocation location,
        double radius,
        long stayTicks,
        long cooldownTicks,
        double weight,
        boolean safe
) {

    public static Perch of(String id, StoredLocation location, PerchDefaults defaults) {
        return new Perch(
                id,
                location,
                defaults.radius(),
                defaults.stayTicks(),
                defaults.cooldownTicks(),
                defaults.weight(),
                defaults.safe());
    }

    /** The values a newly added perch takes, read from battle.yml so no number is hardcoded. */
    public record PerchDefaults(double radius, long stayTicks, long cooldownTicks, double weight, boolean safe) {
    }

    public void write(ConfigurationSection section) {
        location.write(section.createSection("location"));
        section.set("radius", radius);
        section.set("stay-ticks", stayTicks);
        section.set("cooldown-ticks", cooldownTicks);
        section.set("weight", weight);
        section.set("safe", safe);
    }

    public static Perch read(String id, ConfigurationSection section, PerchDefaults defaults) {
        StoredLocation location = StoredLocation.read(section.getConfigurationSection("location"));
        if (location == null) {
            return null;
        }

        return new Perch(
                id,
                location,
                section.getDouble("radius", defaults.radius()),
                section.getLong("stay-ticks", defaults.stayTicks()),
                section.getLong("cooldown-ticks", defaults.cooldownTicks()),
                section.getDouble("weight", defaults.weight()),
                section.getBoolean("safe", defaults.safe()));
    }

    public String describe() {
        return id + " @ " + location.describe()
                + " (r=" + radius + ", stay=" + stayTicks + "t, cd=" + cooldownTicks + "t, w=" + weight + ")";
    }
}
