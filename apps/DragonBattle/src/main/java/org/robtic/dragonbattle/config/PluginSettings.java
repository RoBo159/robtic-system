package org.robtic.dragonbattle.config;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.robtic.dragonbattle.dragon.GroundCombat;
import org.robtic.dragonbattle.model.ArenaSettings;
import org.robtic.dragonbattle.model.Perch;

/**
 * `config.yml` and `battle.yml`, parsed once per reload.
 *
 * Immutable: a reload builds a replacement rather than mutating this, so a read taken mid-reload
 * cannot see half of one file and half of another.
 *
 * <h2>What lives here versus on an arena</h2>
 *
 * These are the <em>defaults</em> a new arena is created with and the fallbacks an existing one uses
 * for any setting it does not override. Nothing here is read during a fight — the arena's own
 * settings are, which is what makes two arenas able to behave differently.
 */
public final class PluginSettings {

    private final long tickInterval;
    private final boolean debug;
    private final ArenaSettings arenaDefaults;
    private final GroundCombat.Settings groundCombat;
    private final long spawnAnimationTicks;

    public PluginSettings(FileConfiguration config, FileConfiguration battle) {
        // Floored at one tick. A zero or negative interval would schedule a task that never runs,
        // and the symptom — a battle that starts and then does nothing at all — gives an operator
        // nothing to go on.
        this.tickInterval = Math.max(1L, config.getLong("tick-interval", 20L));
        this.debug = config.getBoolean("debug", false);

        this.arenaDefaults = readArenaDefaults(battle);
        this.groundCombat = readGroundCombat(battle);
        // Clamped: below a second there is no animation to see, above two minutes players assume it
        // has hung. 100 ticks is five seconds, which is roughly the vanilla respawn.
        this.spawnAnimationTicks = Math.clamp(battle.getLong("spawn-animation-ticks", 100L), 20L, 2400L);

        ConfigurationSection crystals = battle.getConfigurationSection("crystals");

        this.keepRitualCrystals = crystals == null || crystals.getBoolean("keep-after-ritual", true);

        this.crystalHealing = new org.robtic.dragonbattle.dragon.CrystalHealing(
                crystals == null || crystals.getBoolean("heal-dragon", true),
                crystals == null ? 64.0 : crystals.getDouble("heal-range", 64.0),
                crystals == null ? 1.0 : crystals.getDouble("heal-per-tick", 1.0));

        ConfigurationSection flight = battle.getConfigurationSection("flight");

        // Clamped rather than trusted. A negative margin would push the dragon outside the arena it
        // is meant to be held inside, and a huge one would collapse every arena to its own centre.
        this.arenaFlight = new org.robtic.dragonbattle.dragon.ArenaFlight(
                flight == null ? 2.0 : Math.clamp(flight.getDouble("wall-margin", 2.0), 0.0, 16.0),
                flight == null ? 0.5 : Math.clamp(flight.getDouble("tolerance", 0.5), 0.0, 8.0));

        this.dragonFlight = org.robtic.dragonbattle.dragon.DragonFlightSettings.read(
                battle.getConfigurationSection("movement"));
    }

    private final boolean keepRitualCrystals;
    private final org.robtic.dragonbattle.dragon.CrystalHealing crystalHealing;
    private final org.robtic.dragonbattle.dragon.ArenaFlight arenaFlight;
    private final org.robtic.dragonbattle.dragon.DragonFlightSettings dragonFlight;

    /** The last-resort containment check. Not how the arena is respected — see BattleManager#confine. */
    public org.robtic.dragonbattle.dragon.ArenaFlight arenaFlight() {
        return arenaFlight;
    }

    /** Speeds and pattern shapes for the plugin's own flight system. */
    public org.robtic.dragonbattle.dragon.DragonFlightSettings dragonFlight() {
        return dragonFlight;
    }

    /**
     * Whether the ritual leaves its crystals standing.
     *
     * True by default, and that is the vanilla loop: the crystals that summoned the dragon are the
     * ones that heal it, and breaking them is how a fight is won. Consuming them made the ritual
     * tidier and left the fight with no crystal mechanic at all.
     */
    public boolean keepRitualCrystals() {
        return keepRitualCrystals;
    }

    public org.robtic.dragonbattle.dragon.CrystalHealing crystalHealing() {
        return crystalHealing;
    }

    /** Melee tuning for a perched dragon. Bite and tail are this plugin's; breath and roar are not. */
    private static GroundCombat.Settings readGroundCombat(FileConfiguration battle) {
        ConfigurationSection section = battle.getConfigurationSection("ground-combat");
        GroundCombat.Settings defaults = GroundCombat.Settings.defaults();

        if (section == null) {
            return defaults;
        }

        return new GroundCombat.Settings(
                section.getDouble("bite.damage", defaults.biteDamage()),
                section.getDouble("bite.reach", defaults.biteReach()),
                section.getDouble("bite.arc-degrees", defaults.biteArcDegrees()),
                section.getDouble("tail.damage", defaults.tailDamage()),
                section.getDouble("tail.reach", defaults.tailReach()),
                section.getDouble("tail.arc-degrees", defaults.tailArcDegrees()),
                section.getDouble("tail.knockback", defaults.tailKnockback()));
    }

    /** How long the spawn animation runs before the dragon appears. */
    public long spawnAnimationTicks() {
        return spawnAnimationTicks;
    }

    public GroundCombat.Settings groundCombat() {
        return groundCombat;
    }

    private static ArenaSettings readArenaDefaults(FileConfiguration battle) {
        ConfigurationSection perch = battle.getConfigurationSection("perch-defaults");

        Perch.PerchDefaults perchDefaults = new Perch.PerchDefaults(
                perch == null ? 24.0 : perch.getDouble("radius", 24.0),
                perch == null ? 200L : perch.getLong("stay-ticks", 200L),
                perch == null ? 600L : perch.getLong("cooldown-ticks", 600L),
                perch == null ? 1.0 : perch.getDouble("weight", 1.0),
                perch == null || perch.getBoolean("safe", true));

        ConfigurationSection defaults = battle.getConfigurationSection("defaults");

        if (defaults == null) {
            return new ArenaSettings(
                    true,
                    ArenaSettings.PortalReplaceMode.AIR_ONLY,
                    4,
                    true,
                    ArenaSettings.GatewayMode.SEQUENTIAL,
                    false,
                    600L,
                    0.5,
                    true,
                    perchDefaults);
        }

        return new ArenaSettings(
                defaults.getBoolean("generate-portal", true),
                parse(ArenaSettings.PortalReplaceMode.class,
                        defaults.getString("portal-replace-mode"), ArenaSettings.PortalReplaceMode.AIR_ONLY),
                defaults.getInt("portal-radius", 4),
                defaults.getBoolean("spawn-beacon", true),
                parse(ArenaSettings.GatewayMode.class,
                        defaults.getString("gateway-mode"), ArenaSettings.GatewayMode.SEQUENTIAL),
                // Block damage is off by default, deliberately. An arena is usually a build, and a
                // dragon that ate part of it on its first flight is not something an operator can
                // undo — so destruction is opt-in rather than opt-out.
                defaults.getBoolean("allow-block-damage", false),
                defaults.getLong("landing-interval-ticks", 600L),
                defaults.getDouble("landing-chance", 0.5),
                defaults.getBoolean("prefer-player-landing", true),
                perchDefaults);
    }

    /** How often the battle ticker runs, in ticks. */
    public long tickInterval() {
        return tickInterval;
    }

    public boolean debug() {
        return debug;
    }

    /** The settings a newly created arena starts with. */
    public ArenaSettings arenaDefaults() {
        return arenaDefaults;
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String raw, E fallback) {
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
