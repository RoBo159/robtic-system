package org.robtic.dragonbattle.dragon;

import org.bukkit.configuration.ConfigurationSection;

/**
 * How the dragon flies: speeds, distances and the shape of each attack pattern.
 *
 * <h2>No height anywhere</h2>
 *
 * Deliberately. Every value here is a speed, a radius or an offset relative to something the fight
 * supplied — an arena centre, a perch, a player. There is no "flight altitude" to configure because
 * there is no longer such a thing: the dragon flies wherever the arena and the boss logic put it.
 *
 * The two vertical values, {@link #diveHeight()} and {@link #strafeHeight()}, are offsets *from the
 * player being attacked*. A fight in a cavern at y=12 strafes at y=12 plus the offset.
 */
public record DragonFlightSettings(
        double cruiseSpeed,
        double approachSpeed,
        double diveSpeed,
        double circleRadius,
        long circlePeriodTicks,
        double diveHeight,
        double diveOvershoot,
        double strafeRadius,
        double strafeHeight,
        long strafePeriodTicks,
        double arrivalDistance
) {

    /**
     * Clamped on the way in.
     *
     * A zero or negative speed is a dragon that never arrives anywhere, which presents as a fight
     * that starts and then does nothing — and gives an operator nothing to go on. A speed high
     * enough to cross the arena in a tick would read as teleporting rather than flight, so the top
     * of the range is bounded too.
     */
    public DragonFlightSettings {
        cruiseSpeed = clamp(cruiseSpeed, 0.05d, 3.0d);
        approachSpeed = clamp(approachSpeed, 0.05d, 3.0d);
        diveSpeed = clamp(diveSpeed, 0.05d, 5.0d);

        circleRadius = clamp(circleRadius, 2.0d, 256.0d);
        circlePeriodTicks = (long) clamp(circlePeriodTicks, 20L, 1200L);

        diveHeight = clamp(diveHeight, -64.0d, 64.0d);
        diveOvershoot = clamp(diveOvershoot, 1.0d, 32.0d);

        strafeRadius = clamp(strafeRadius, 2.0d, 128.0d);
        strafeHeight = clamp(strafeHeight, -64.0d, 64.0d);
        strafePeriodTicks = (long) clamp(strafePeriodTicks, 20L, 1200L);

        arrivalDistance = clamp(arrivalDistance, 0.5d, 16.0d);
    }

    /** What ships when `battle.yml` says nothing. */
    public static DragonFlightSettings defaults() {
        return new DragonFlightSettings(
                0.55d, 0.45d, 1.1d,
                24.0d, 200L,
                6.0d, 4.0d,
                16.0d, 10.0d, 160L,
                2.0d);
    }

    public static DragonFlightSettings read(ConfigurationSection section) {
        DragonFlightSettings fallback = defaults();

        if (section == null) {
            return fallback;
        }

        return new DragonFlightSettings(
                section.getDouble("cruise-speed", fallback.cruiseSpeed()),
                section.getDouble("approach-speed", fallback.approachSpeed()),
                section.getDouble("dive-speed", fallback.diveSpeed()),
                section.getDouble("circle-radius", fallback.circleRadius()),
                section.getLong("circle-period-ticks", fallback.circlePeriodTicks()),
                section.getDouble("dive-height", fallback.diveHeight()),
                section.getDouble("dive-overshoot", fallback.diveOvershoot()),
                section.getDouble("strafe-radius", fallback.strafeRadius()),
                section.getDouble("strafe-height", fallback.strafeHeight()),
                section.getLong("strafe-period-ticks", fallback.strafePeriodTicks()),
                section.getDouble("arrival-distance", fallback.arrivalDistance()));
    }

    private static double clamp(double value, double low, double high) {
        return Double.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
    }
}
