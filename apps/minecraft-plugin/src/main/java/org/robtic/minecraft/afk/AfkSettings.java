package org.robtic.minecraft.afk;

import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.logging.Logger;

/**
 * `afk.yml`, parsed once per reload.
 *
 * Immutable, like the rest of the plugin's settings objects: a reload builds a replacement rather
 * than mutating this one, so a read mid-reload cannot see a half-applied file.
 */
public final class AfkSettings {

    private final boolean enabled;
    private final String worldName;
    private final boolean hidePlayers;

    private final boolean rewardsEnabled;
    private final double robsPerHour;

    private final boolean overlayEnabled;
    private final long overlayIntervalTicks;

    private final boolean trackTotalTime;
    private final boolean trackToday;
    private final boolean showProfileStatistics;

    private final long timeoutMillis;
    private final long checkIntervalTicks;

    private final boolean detectMovement;
    private final boolean detectRotation;
    private final boolean detectCommands;
    private final boolean detectChat;
    private final boolean detectInventory;

    private final boolean autoReturn;
    private final long settleMillis;
    private final boolean exemptStaff;

    private final Sound enterSound;
    private final Sound leaveSound;

    private final FileConfiguration raw;

    public AfkSettings(FileConfiguration config, Logger logger) {
        this.raw = config;
        this.enabled = config.getBoolean("afk.enabled", true);

        this.worldName = config.getString("afk.world", "").trim();
        this.hidePlayers = config.getBoolean("afk.hide-players", true);

        this.rewardsEnabled = config.getBoolean("afk.rewards.enabled", true);
        // Read as a double so a fractional rate is honoured, and floored at zero rather than
        // rejected: a negative rate would debit players for standing still, which no operator means
        // and which the economy would happily apply.
        this.robsPerHour = Math.max(0d, config.getDouble("afk.rewards.robs-per-hour", 10d));

        this.overlayEnabled = config.getBoolean("afk.overlay.enabled", true);
        // Floored at 5 ticks and capped at 60. Below the floor is redrawing faster than a player can
        // read; above the ceiling the action bar fades between refreshes and the line flickers.
        this.overlayIntervalTicks =
                Math.clamp(config.getLong("afk.overlay.update-interval-ticks", 20L), 5L, 60L);

        this.trackTotalTime = config.getBoolean("afk.statistics.track-total-time", true);
        this.trackToday = config.getBoolean("afk.statistics.track-today", true);
        this.showProfileStatistics = config.getBoolean("afk.profile.show-afk-statistics", true);

        // Floored at 10s. A timeout shorter than the check interval would move players at a moment
        // decided by the scheduler rather than by the configured value, which reads as a bug.
        this.timeoutMillis = Math.max(10L, config.getLong("afk.timeout", 300L)) * 1000L;
        this.checkIntervalTicks = Math.max(20L, config.getLong("afk.check-interval-ticks", 100L));

        this.detectMovement = config.getBoolean("afk.detect.movement", true);
        this.detectRotation = config.getBoolean("afk.detect.rotation", false);
        this.detectCommands = config.getBoolean("afk.detect.commands", true);
        this.detectChat = config.getBoolean("afk.detect.chat", true);
        this.detectInventory = config.getBoolean("afk.detect.inventory", true);

        this.autoReturn = config.getBoolean("afk.auto_return", true);
        // Floored at 250ms rather than allowed to be 0: the teleport that moves a player into the
        // lobby produces the very move event this window exists to ignore, and a zero window is
        // therefore indistinguishable from the bug it fixes.
        this.settleMillis = Math.max(250L, config.getLong("afk.settle-ms", 2000L));
        this.exemptStaff = config.getBoolean("afk.exempt-staff-mode", true);

        this.enterSound = sound(config.getString("afk.sounds.enter", ""), logger);
        this.leaveSound = sound(config.getString("afk.sounds.leave", ""), logger);
    }

    /**
     * Resolves a sound by name, tolerating a typo.
     *
     * A misspelled sound is a cosmetic mistake and must not stop the AFK system loading, so it is
     * logged and treated as "no sound" rather than thrown.
     */
    private static Sound sound(String name, Logger logger) {
        if (name == null || name.isBlank()) {
            return null;
        }

        try {
            return Sound.valueOf(name.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            logger.warning("Unknown sound \"" + name + "\" in afk.yml — no sound will be played.");
            return null;
        }
    }

    public boolean enabled() {
        return enabled;
    }

    public long timeoutMillis() {
        return timeoutMillis;
    }

    /** How often the sweep runs. Not how often each player is examined — see AfkService. */
    public long checkIntervalTicks() {
        return checkIntervalTicks;
    }

    public boolean detectMovement() {
        return detectMovement;
    }

    /**
     * Whether looking around counts as activity.
     *
     * Off by default, and that default matters: a player resting a mouse on a desk drifts the view
     * by fractions of a degree, and treating that as activity means nobody is ever AFK.
     */
    public boolean detectRotation() {
        return detectRotation;
    }

    public boolean detectCommands() {
        return detectCommands;
    }

    public boolean detectChat() {
        return detectChat;
    }

    public boolean detectInventory() {
        return detectInventory;
    }

    public boolean autoReturn() {
        return autoReturn;
    }

    /**
     * How long after entering AFK activity is ignored.
     *
     * The teleport into the lobby is movement, and it arrives at {@link AfkService#touch} with the
     * player already marked AFK — so without this window the auto-return fires on the same tick the
     * player went AFK and puts them straight back.
     */
    public long settleMillis() {
        return settleMillis;
    }

    /** Whether staff in `/admin` mode are left alone. On by default; they are working, not idle. */
    public boolean exemptStaffMode() {
        return exemptStaff;
    }

    public Sound enterSound() {
        return enterSound;
    }

    public Sound leaveSound() {
        return leaveSound;
    }

    /** The AFK world's name, or blank when only the explicit lobby coordinates are configured. */
    public String worldName() {
        return worldName;
    }

    /** Whether an AFK player is hidden from everyone, and everyone from them. */
    public boolean hidePlayers() {
        return hidePlayers;
    }

    public boolean rewardsEnabled() {
        return rewardsEnabled;
    }

    public double robsPerHour() {
        return robsPerHour;
    }

    /** Whether AFK players are shown a status line above their hotbar. */
    public boolean overlayEnabled() {
        return overlayEnabled;
    }

    public long overlayIntervalTicks() {
        return overlayIntervalTicks;
    }

    public boolean trackTotalTime() {
        return trackTotalTime;
    }

    public boolean trackToday() {
        return trackToday;
    }

    public boolean showProfileStatistics() {
        return showProfileStatistics;
    }

    /**
     * Where an AFK player is sent, or null when nothing usable is configured.
     *
     * The explicit lobby wins when it resolves, so `/afk setlobby` still puts players on a precise
     * spot rather than wherever the world spawn happens to be. Falling back to the AFK world's spawn
     * is what makes `world: afk` sufficient on its own — an operator who has created the world has
     * configured the feature, and should not also have to stand in it and run a command.
     */
    public Location destination() {
        Location configured = lobby();
        if (configured != null) {
            return configured;
        }

        org.bukkit.World resolved = worldName.isBlank() ? null : org.bukkit.Bukkit.getWorld(worldName);
        return resolved == null ? null : resolved.getSpawnLocation();
    }

    /** The configured lobby, or null when unset or its world is not loaded. */
    public Location lobby() {
        ConfigurationSection section = raw.getConfigurationSection("afk.lobby");
        if (section == null) {
            return null;
        }

        String world = section.getString("world", "");
        if (world.isBlank()) {
            return null;
        }

        org.bukkit.World resolved = org.bukkit.Bukkit.getWorld(world);
        return resolved == null ? null : new Location(
                resolved,
                section.getDouble("x"),
                section.getDouble("y"),
                section.getDouble("z"),
                (float) section.getDouble("yaw"),
                (float) section.getDouble("pitch")
        );
    }

    /** The backing document, for `/robtic afk setlobby` to write into and save. */
    public FileConfiguration raw() {
        return raw;
    }
}
