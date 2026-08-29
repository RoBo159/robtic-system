package org.robtic.dragonbattle.model;

import org.bukkit.configuration.ConfigurationSection;

/**
 * Per-arena behaviour: what the fight is allowed to do, and how often.
 *
 * Separate from {@link Arena} because an arena is <em>where</em> and this is <em>how</em>. Keeping
 * them apart means an operator can copy one arena's tuning onto another without copying its
 * coordinates, and it keeps the aggregate readable as it grows.
 *
 * Every field has a default drawn from battle.yml, so an arena created today picks up sensible
 * values and an arena created before a setting existed still loads.
 */
public record ArenaSettings(
        boolean generatePortal,
        PortalReplaceMode portalReplaceMode,
        int portalRadius,
        boolean spawnBeacon,
        GatewayMode gatewayMode,
        boolean allowBlockDamage,
        long landingIntervalTicks,
        double landingChance,
        boolean preferPlayerLanding,
        Perch.PerchDefaults perchDefaults
) {

    /** How the exit portal treats blocks already standing where it wants to build. */
    public enum PortalReplaceMode {
        /**
         * Only place into air. The default, because an arena is usually a build, and a portal that
         * ate part of it is not something an operator can undo.
         */
        AIR_ONLY,
        /** Replace whatever is there. Vanilla behaviour. */
        REPLACE_ALL,
        /** Replace only the materials listed in battle.yml. */
        WHITELIST
    }

    /** Which of the configured gateway positions is used after a kill. */
    public enum GatewayMode {
        /** One per kill, in configured order, wrapping around — mirrors vanilla's ring. */
        SEQUENTIAL,
        /** One per kill, chosen at random from those not yet used. */
        RANDOM,
        /** Every configured position at once, on the first kill. */
        ALL
    }

    public static ArenaSettings read(ConfigurationSection section, ArenaSettings defaults) {
        if (section == null) {
            return defaults;
        }

        return new ArenaSettings(
                section.getBoolean("generate-portal", defaults.generatePortal()),
                enumValue(PortalReplaceMode.class, section.getString("portal-replace-mode"), defaults.portalReplaceMode()),
                section.getInt("portal-radius", defaults.portalRadius()),
                section.getBoolean("spawn-beacon", defaults.spawnBeacon()),
                enumValue(GatewayMode.class, section.getString("gateway-mode"), defaults.gatewayMode()),
                section.getBoolean("allow-block-damage", defaults.allowBlockDamage()),
                section.getLong("landing-interval-ticks", defaults.landingIntervalTicks()),
                section.getDouble("landing-chance", defaults.landingChance()),
                section.getBoolean("prefer-player-landing", defaults.preferPlayerLanding()),
                defaults.perchDefaults());
    }

    public void write(ConfigurationSection section) {
        section.set("generate-portal", generatePortal);
        section.set("portal-replace-mode", portalReplaceMode.name());
        section.set("portal-radius", portalRadius);
        section.set("spawn-beacon", spawnBeacon);
        section.set("gateway-mode", gatewayMode.name());
        section.set("allow-block-damage", allowBlockDamage);
        section.set("landing-interval-ticks", landingIntervalTicks);
        section.set("landing-chance", landingChance);
        section.set("prefer-player-landing", preferPlayerLanding);
    }

    /**
     * Parses an enum by name, falling back rather than throwing.
     *
     * A misspelled mode in a config file is an operator's typo, and taking the whole arena — or the
     * whole plugin — down over it would be a worse outcome than quietly using the default. The
     * caller logs it; see ArenaStorage.
     */
    private static <E extends Enum<E>> E enumValue(Class<E> type, String raw, E fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }

        try {
            return Enum.valueOf(type, raw.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            return fallback;
        }
    }
}
