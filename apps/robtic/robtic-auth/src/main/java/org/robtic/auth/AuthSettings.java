package org.robtic.auth;

import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.logging.Logger;

/**
 * `auth.yml`, parsed once per reload.
 *
 * Immutable, like every other settings object here: a reload builds a replacement rather than
 * mutating this one, so a read mid-reload cannot see a half-applied file.
 */
public final class AuthSettings {

    /** Always runnable, whatever the configuration says. Without it a new player cannot link. */
    private static final String ALWAYS_ALLOWED = "link";

    private final boolean enabled;
    private final String linkWorldName;
    private final boolean holdEveryoneInLinkWorld;
    private final long timeoutSeconds;
    private final boolean preJoinLogin;
    private final long preJoinTimeoutSeconds;

    private final boolean sessionsEnabled;
    private final boolean bindToIp;

    private final Set<String> restrictions;
    private final Set<String> allowedCommands;

    private final Sound promptSound;
    private final Sound successSound;
    private final Sound failureSound;

    public AuthSettings(FileConfiguration config, Logger logger) {
        this.enabled = config.getBoolean("auth.enabled", true);
        this.linkWorldName = config.getString("auth.link-world", "").trim();

        // "all" — every unauthenticated player waits in the link world. "unlinked" is the older
        // behaviour, where somebody who merely had to type a password stayed in the survival world
        // while they did it. Anything else is a typo, and defaulting a typo to the laxer of the two
        // would silently leave players standing in spawn, so it resolves to "all" and says so.
        String holds = config.getString("auth.link-world-holds", "all").trim().toLowerCase(Locale.ROOT);

        if (!holds.equals("all") && !holds.equals("unlinked")) {
            logger.warning("auth.yml: link-world-holds is \"" + holds
                    + "\". Valid values are all and unlinked. Using all.");
            holds = "all";
        }

        this.holdEveryoneInLinkWorld = holds.equals("all");

        this.timeoutSeconds = Math.max(0L, config.getLong("auth.timeout-seconds", 180L));

        this.preJoinLogin = config.getBoolean("auth.pre-join-login", true);
        // Floored at 15s and capped at 10 minutes. The floor stops a misconfiguration disconnecting
        // players faster than they can type; the ceiling stops one holding a connection thread for
        // an hour because somebody walked away.
        this.preJoinTimeoutSeconds =
                Math.clamp(config.getLong("auth.pre-join-timeout-seconds", 120L), 15L, 600L);

        this.sessionsEnabled = config.getBoolean("auth.session.enabled", true);
        this.bindToIp = config.getBoolean("auth.session.bind-to-ip", true);

        this.restrictions = enabledRestrictions(config);

        Set<String> commands = lowercase(config.getStringList("auth.allowed-commands"));
        commands.add(ALWAYS_ALLOWED);
        this.allowedCommands = Set.copyOf(commands);

        this.promptSound = sound(config.getString("auth.sounds.prompt", ""), logger);
        this.successSound = sound(config.getString("auth.sounds.success", ""), logger);
        this.failureSound = sound(config.getString("auth.sounds.failure", ""), logger);
    }

    /**
     * Reads the restriction toggles into the set of those that are on.
     *
     * Each key defaults to true, so a restriction an operator has never heard of — one added by a
     * later version, most likely — is applied rather than silently skipped. The safe direction for
     * a list describing what an unverified player may not do is "everything, unless told otherwise".
     */
    private static Set<String> enabledRestrictions(FileConfiguration config) {
        Set<String> active = new LinkedHashSet<>();

        for (String key : List.of(
                "movement", "chat", "commands", "inventory", "block-break", "block-place",
                "interact", "entity-interact", "damage", "item-pickup", "item-drop",
                "portal", "world-change", "teleport")) {
            if (config.getBoolean("auth.restrictions." + key, true)) {
                active.add(key);
            }
        }

        return Set.copyOf(active);
    }

    private static Set<String> lowercase(List<String> values) {
        Set<String> result = new LinkedHashSet<>();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                result.add(value.trim().toLowerCase(Locale.ROOT));
            }
        }
        return result;
    }

    /** As {@code AfkSettings}: a misspelled sound is cosmetic and must not stop auth loading. */
    private static Sound sound(String name, Logger logger) {
        if (name == null || name.isBlank()) {
            return null;
        }

        try {
            return Sound.valueOf(name.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            logger.warning("Unknown sound \"" + name + "\" in auth.yml — no sound will be played.");
            return null;
        }
    }

    public boolean enabled() {
        return enabled;
    }

    public String linkWorldName() {
        return linkWorldName;
    }

    /**
     * Whether every unauthenticated player is held in the link world, or only unlinked ones.
     *
     * True by default. A player who is linked but has no session still has not proved who they are,
     * and leaving them standing in the survival world while they type a password put an unverified
     * client in a place other players can see — which the restrictions make harmless but do not make
     * sensible.
     */
    public boolean holdEveryoneInLinkWorld() {
        return holdEveryoneInLinkWorld;
    }

    /** True when the named world is the link world. */
    public boolean isLinkWorld(String candidate) {
        return !linkWorldName.isBlank() && linkWorldName.equalsIgnoreCase(candidate);
    }

    /** The link world's spawn, or null when none is configured or it is not loaded. */
    public Location linkWorldSpawn() {
        if (linkWorldName.isBlank()) {
            return null;
        }

        World world = org.bukkit.Bukkit.getWorld(linkWorldName);
        return world == null ? null : world.getSpawnLocation();
    }

    public long timeoutSeconds() {
        return timeoutSeconds;
    }

    /** Whether the password is asked for during configuration, before the world is entered. */
    public boolean preJoinLogin() {
        return preJoinLogin;
    }

    public long preJoinTimeoutSeconds() {
        return preJoinTimeoutSeconds;
    }

    public boolean sessionsEnabled() {
        return sessionsEnabled;
    }

    /**
     * Whether a session must be resumed from the address that opened it.
     *
     * On by default, and the default is the whole point — see the note in auth.yml. With it off on
     * an offline-mode server, a session is not a convenience but a bypass.
     */
    public boolean bindToIp() {
        return bindToIp;
    }

    /** Whether one named restriction applies to unauthenticated players. */
    public boolean restricts(String key) {
        return restrictions.contains(key);
    }

    /** Whether an unauthenticated player may run this command label. */
    public boolean commandAllowed(String label) {
        return allowedCommands.contains(label.toLowerCase(Locale.ROOT));
    }

    public Sound promptSound() {
        return promptSound;
    }

    public Sound successSound() {
        return successSound;
    }

    public Sound failureSound() {
        return failureSound;
    }
}
