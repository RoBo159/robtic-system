package org.robtic.staff.config;

import org.bukkit.configuration.file.FileConfiguration;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * `staff.yml` — the behavioural rules of the staff system.
 *
 * The two command whitelists are the security-relevant part. A frozen or jailed player is blocked
 * from every command *except* those listed, rather than blocked from a list of known-bad ones: a
 * deny-list would be one `/tpa` alias away from letting someone walk out of a jail.
 */
public final class StaffSettings {

    private final boolean teleportOnReportAccept;

    private final Set<String> freezeAllowedCommands;
    private final Set<String> jailAllowedCommands;

    private final long freezeActionBarIntervalTicks;
    private final boolean freezeBlockInteract;
    private final boolean freezeBlockDrop;
    private final boolean freezeBlockVehicles;

    private final boolean vanishTeleportToGate;
    private final boolean vanishHideFromTab;
    private final boolean vanishSuppressJoinQuit;
    private final boolean vanishSilentChestOpen;

    private final boolean bookOpensLobby;
    private final int playerListRows;
    private final boolean confirmDestructiveActions;

    private final List<String> clockActions;

    public StaffSettings(FileConfiguration config) {
        this.teleportOnReportAccept = config.getBoolean("reports.teleport-on-accept", true);
        this.freezeAllowedCommands = lowercaseSet(config.getStringList("freeze.allowed-commands"));
        this.jailAllowedCommands = lowercaseSet(config.getStringList("jail.allowed-commands"));

        this.freezeActionBarIntervalTicks = Math.max(10L, config.getLong("freeze.actionbar-interval-ticks", 20L));
        this.freezeBlockInteract = config.getBoolean("freeze.block-interact", true);
        this.freezeBlockDrop = config.getBoolean("freeze.block-drop", true);
        this.freezeBlockVehicles = config.getBoolean("freeze.block-vehicles", true);

        this.vanishTeleportToGate = config.getBoolean("vanish.teleport-to-gate", true);
        this.vanishHideFromTab = config.getBoolean("vanish.hide-from-tab", true);
        this.vanishSuppressJoinQuit = config.getBoolean("vanish.suppress-join-quit", true);
        this.vanishSilentChestOpen = config.getBoolean("vanish.silent-chest-open", true);

        this.bookOpensLobby = "lobby".equalsIgnoreCase(config.getString("book.mode", "lobby"));
        this.playerListRows = Math.min(6, Math.max(1, config.getInt("gui.player-list-rows", 6)));
        this.confirmDestructiveActions = config.getBoolean("gui.confirm-destructive", true);

        this.clockActions = config.getStringList("clock.actions");
    }

    /**
     * Whether a frozen player may run this command.
     *
     * The whole command line is checked against the whitelist by its first token, with the leading
     * slash and any plugin namespace stripped — `/essentials:msg` must not slip past a rule
     * written for `msg`.
     */
    public boolean isFreezeCommandAllowed(String commandLine) {
        return isAllowed(freezeAllowedCommands, commandLine);
    }

    public boolean isJailCommandAllowed(String commandLine) {
        return isAllowed(jailAllowedCommands, commandLine);
    }

    private boolean isAllowed(Set<String> allowed, String commandLine) {
        String first = commandLine.trim().split("\\s+")[0];
        if (first.startsWith("/")) {
            first = first.substring(1);
        }

        int namespace = first.indexOf(':');
        if (namespace >= 0) {
            first = first.substring(namespace + 1);
        }

        return allowed.contains(first.toLowerCase(Locale.ROOT));
    }

    public long freezeActionBarIntervalTicks() {
        return freezeActionBarIntervalTicks;
    }

    public boolean freezeBlockInteract() {
        return freezeBlockInteract;
    }

    public boolean freezeBlockDrop() {
        return freezeBlockDrop;
    }

    public boolean freezeBlockVehicles() {
        return freezeBlockVehicles;
    }

    /** Whether vanishing also moves the player to the admin gate. */
    public boolean vanishTeleportToGate() {
        return vanishTeleportToGate;
    }

    public boolean vanishHideFromTab() {
        return vanishHideFromTab;
    }

    public boolean vanishSuppressJoinQuit() {
        return vanishSuppressJoinQuit;
    }

    public boolean vanishSilentChestOpen() {
        return vanishSilentChestOpen;
    }

    /** True when the book opens the lobby menu; false switches it to player inspection. */
    public boolean bookOpensLobby() {
        return bookOpensLobby;
    }

    public int playerListRows() {
        return playerListRows;
    }

    /**
     * Whether accepting a report teleports the staff member to the reporter.
     *
     * On by default: the first thing a staff member does after claiming is go and look, and making
     * them type a teleport as well is a step with no decision in it.
     */
    public boolean teleportOnReportAccept() {
        return teleportOnReportAccept;
    }

    public boolean confirmDestructiveActions() {
        return confirmDestructiveActions;
    }

    /** Action ids offered by the clock, in menu order. */
    public List<String> clockActions() {
        return clockActions;
    }

    private static Set<String> lowercaseSet(List<String> values) {
        return values.stream().map(value -> value.toLowerCase(Locale.ROOT)).collect(Collectors.toUnmodifiableSet());
    }
}
