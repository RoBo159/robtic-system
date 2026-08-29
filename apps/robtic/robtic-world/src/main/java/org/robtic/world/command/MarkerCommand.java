package org.robtic.world.command;

import org.bukkit.block.Block;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.world.StructureMarkerSystem;
import org.robtic.world.api.MarkerProblem;
import org.robtic.world.api.MarkerType;
import org.robtic.world.api.PlacedMarker;
import org.robtic.world.config.MarkerSettings;
import org.robtic.world.gui.MarkerMenu;
import org.robtic.world.scan.ScanReport;
import org.robtic.core.util.Chat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * {@code /structure marker …} — everything a builder needs while designing a structure.
 *
 * <h2>One command, because a builder only has one job here</h2>
 *
 * {@code edit} opens the menu and is the only one the workflow strictly needs. The rest exist
 * because designing a structure without them means saving a schematic, waiting for it to generate,
 * and reading a console log to find out that a corner marker was missing — a feedback loop measured
 * in hours. {@code validate} collapses that to a second, in the build world, before the schematic is
 * ever saved.
 */
public final class MarkerCommand implements CommandExecutor, TabCompleter {

    /** Held by builders and admins. Placing markers is a design activity, not a gameplay one. */
    public static final String PERMISSION = "robtic.markers";

    /**
     * The command this plugin registers.
     *
     * <h2>Why it is not {@code workspace} any more</h2>
     *
     * In the monolith this lived on {@code /workspace}, with {@code structure} as an alias. That
     * cannot hold in the split: RobticJobs owns workspaces and will want {@code /workspace} for
     * managing them, and two plugins cannot both register the same command as their primary.
     *
     * So the names have swapped — {@code structure} is primary, which is also the honest description
     * of what this command does, and {@code workspace} is kept as an alias so
     * {@code /workspace marker edit} keeps working for anyone with it in muscle memory or in a
     * builder's notes.
     *
     * The handover is automatic when RobticJobs arrives: Bukkit resolves a plugin's primary command
     * ahead of another plugin's alias, so {@code /workspace} starts meaning Jobs' command on the day
     * Jobs is installed, and this one stays reachable as {@code /structure}.
     */
    public static final String COMMAND = "structure";

    private final StructureMarkerSystem system;
    private final MarkerMenu menu;
    private final Supplier<MarkerSettings> settings;

    public MarkerCommand(StructureMarkerSystem system, MarkerMenu menu, Supplier<MarkerSettings> settings) {
        this.system = system;
        this.menu = menu;
        this.settings = settings;
    }

    @Override
    public boolean onCommand(
            @NotNull CommandSender sender,
            @NotNull Command command,
            @NotNull String label,
            @NotNull String[] args
    ) {
        if (args.length == 0 || !args[0].equalsIgnoreCase("marker")) {
            sender.sendMessage(Chat.component(
                    "&7Usage: &f/" + label + " marker <edit|validate|scan|set|info|list|reload>"));
            return true;
        }

        if (!sender.hasPermission(PERMISSION)) {
            sender.sendMessage(Chat.component("&cYou do not have permission to work with markers."));
            return true;
        }

        String sub = args.length > 1 ? args[1].toLowerCase(Locale.ROOT) : "edit";

        switch (sub) {
            case "edit" -> edit(sender);
            case "validate" -> scan(sender, args, false);
            case "scan" -> scan(sender, args, true);
            case "info" -> info(sender);
            case "set" -> set(sender, args);
            case "list" -> list(sender);
            case "reload" -> reload(sender);
            default -> sender.sendMessage(Chat.component(
                    "&7Usage: &f/" + label + " marker <edit|validate|scan|set|info|list|reload>"));
        }

        return true;
    }

    // ─── Subcommands ──────────────────────────────────────────────────────────────────────────

    private void edit(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Chat.component("&cOnly a player can open the marker menu."));
            return;
        }

        if (!settings.get().enabled()) {
            sender.sendMessage(Chat.component("&cThe marker system is disabled in markers.yml."));
            return;
        }

        menu.open(player, MarkerMenu.ALL, 0);
    }

    /**
     * Scans around the player and reports.
     *
     * The two modes differ in exactly one respect: whether the result is kept. {@code validate}
     * reads the markers and throws the result away, which is what makes it safe to run repeatedly in
     * a build world. {@code scan} registers the structure and clears the marker blocks, which is
     * what a generated building does automatically and an admin occasionally needs to force by hand.
     */
    private void scan(CommandSender sender, String[] args, boolean register) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Chat.component("&cOnly a player can scan — the scan starts where you are standing."));
            return;
        }

        int radius = settings.get().scanRadius();

        if (args.length > 2) {
            try {
                radius = Math.max(1, Math.min(128, Integer.parseInt(args[2])));
            } catch (NumberFormatException notANumber) {
                sender.sendMessage(Chat.component("&c\"" + args[2] + "\" is not a number."));
                return;
            }
        }

        ScanReport report = register
                ? system.scanAndRegister(player.getLocation(), radius)
                : system.validate(player.getLocation(), radius);

        if (!report.foundAnything()) {
            sender.sendMessage(Chat.component(
                    "&7No markers within &f" + radius + "&7 blocks. Place a marker first, or use a"
                            + " larger radius: &f/" + COMMAND + " marker " + (register ? "scan" : "validate") + " 96"));
            return;
        }

        report(sender, report, register);
    }

    private void report(CommandSender sender, ScanReport report, boolean registered) {
        sender.sendMessage(Chat.component("&8&m                                        "));
        sender.sendMessage(Chat.component("&6Structure scan &8· &7" + report.summary()));

        for (var entry : countsOf(report)) {
            sender.sendMessage(Chat.component("  &8· &7" + entry));
        }

        for (MarkerProblem problem : report.fatal()) {
            sender.sendMessage(Chat.component("  &c✖ " + problem.describe()));
        }

        for (MarkerProblem problem : report.warnings()) {
            sender.sendMessage(Chat.component("  &e⚠ " + problem.describe()));
        }

        if (report.ok()) {
            sender.sendMessage(Chat.component(registered
                    ? "&aRegistered. &7Markers have been read and cleared."
                    : "&aThis structure is valid. &7Nothing was changed — save the schematic."));
        } else {
            sender.sendMessage(Chat.component(
                    "&cThis structure cannot be used until the errors above are fixed."));
        }

        sender.sendMessage(Chat.component("&8&m                                        "));
    }

    /** A per-type tally, so a builder can see at a glance what the scan actually picked up. */
    private List<String> countsOf(ScanReport report) {
        List<String> lines = new ArrayList<>();

        report.markers().stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        PlacedMarker::typeId, java.util.TreeMap::new, java.util.stream.Collectors.counting()))
                .forEach((typeId, count) -> lines.add(count + "× " + typeId));

        return lines;
    }

    /**
     * Everything about the marker the player is looking at.
     *
     * The one tool for "what did I actually place here", which matters because a marker's identity is
     * in data a builder cannot see. The sign's text is a label and can be out of date if a type was
     * renamed; this reads the container.
     */
    private void info(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Chat.component("&cOnly a player can do that."));
            return;
        }

        Block target = player.getTargetBlockExact(8);

        if (target == null) {
            sender.sendMessage(Chat.component("&cLook at a marker block, within 8 blocks."));
            return;
        }

        Optional<PlacedMarker> marker = system.items().read(target);

        if (marker.isEmpty()) {
            sender.sendMessage(Chat.component("&cThat is not a marker."));
            return;
        }

        PlacedMarker found = marker.get();
        Optional<MarkerType> type = system.registry().get(found.typeId());

        sender.sendMessage(Chat.component("&8&m                                        "));
        sender.sendMessage(Chat.component("&6Marker &8· &f" + found.typeId()));
        sender.sendMessage(Chat.component("  &8id &7" + found.markerId()));
        sender.sendMessage(Chat.component("  &8version &7" + found.version()));
        sender.sendMessage(Chat.component("  &8at &7" + found.point().describe()));
        sender.sendMessage(Chat.component("  &8facing &7" + Math.round(found.yaw()) + "°"));
        sender.sendMessage(Chat.component("  &8spawns at &7" + found.spawn().describe()));

        if (type.isEmpty()) {
            sender.sendMessage(Chat.component("  &c✖ This type is not registered."));
        } else {
            sender.sendMessage(Chat.component("  &8role &7"
                    + (type.get().spawnsNpc() ? type.get().npcRole() : "none")));
            sender.sendMessage(Chat.component("  &8level &7" + type.get().level()));
        }

        if (found.metadata().isEmpty()) {
            sender.sendMessage(Chat.component("  &8metadata &7none"));
        } else {
            found.metadata().forEach((key, value) ->
                    sender.sendMessage(Chat.component("  &8· &7" + key + " = &f" + value)));
        }

        sender.sendMessage(Chat.component("&8&m                                        "));
    }

    /**
     * {@code /structure marker set <key> [value]} — writes metadata onto the marker being looked at.
     *
     * <h2>This is how a marker says what it is for</h2>
     *
     * A recruiter marker offers a profession; a level marker names a schematic; a mailbox marker has
     * a capacity. All of those are facts about one placement rather than about a type, and until this
     * existed there was no way to record one: metadata could only come from a type's {@code defaults}
     * in {@code markers.yml}, which applies to every marker of that type everywhere.
     *
     * Omitting the value clears the key, so a typo is undone with the same command rather than by
     * breaking the marker and placing a new one.
     *
     * A key the type does not declare is written anyway and warned about. That is the same judgement
     * the validator makes and for the same reason: writing metadata ahead of the feature that will
     * read it is deliberately allowed, so the message is a spelling check rather than a refusal.
     */
    private void set(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Chat.component("&cOnly a player can do that."));
            return;
        }

        if (args.length < 3) {
            sender.sendMessage(Chat.component(
                    "&7Usage: &f/" + COMMAND + " marker set <key> [value]"));
            sender.sendMessage(Chat.component(
                    "&8Look at the marker first. Omit the value to clear the key."));
            return;
        }

        Block target = player.getTargetBlockExact(8);

        if (target == null) {
            sender.sendMessage(Chat.component("&cLook at a marker block, within 8 blocks."));
            return;
        }

        String key = args[2].toLowerCase(Locale.ROOT);

        // Everything after the key, so a value may contain spaces.
        String value = args.length > 3
                ? String.join(" ", java.util.Arrays.copyOfRange(args, 3, args.length))
                : "";

        Optional<PlacedMarker> updated = system.items().setMetadata(target, key, value);

        if (updated.isEmpty()) {
            sender.sendMessage(Chat.component("&cThat is not a marker."));
            return;
        }

        if (value.isBlank()) {
            sender.sendMessage(Chat.component("&aCleared &f" + key + "&a on this "
                    + updated.get().typeId() + " marker."));
            return;
        }

        sender.sendMessage(Chat.component("&aSet &f" + key + " &7= &f" + value
                + " &aon this " + updated.get().typeId() + " marker."));

        system.registry().get(updated.get().typeId()).ifPresent(type -> {
            if (!type.metadataKeys().contains(key)
                    && !key.equals(PlacedMarker.OFFSET)
                    && !key.equals(PlacedMarker.YAW)) {

                sender.sendMessage(Chat.component("&e⚠ \"" + key + "\" is not declared by this marker"
                        + " type. It is stored, but check the spelling or add it to metadata-keys."));
            }
        });
    }

    private void list(CommandSender sender) {
        sender.sendMessage(Chat.component("&6Registered marker types &8· &7" + system.registry().size()));

        for (MarkerType type : system.registry().all()) {
            sender.sendMessage(Chat.component("  &8· &f" + type.id() + " &8("
                    + type.categoryId() + (type.required() ? ", required" : "")
                    + (type.level() > 0 ? ", level " + type.level() : "")
                    + (type.spawnsNpc() ? ", role " + type.npcRole() : "")
                    + ")"));
        }
    }

    private void reload(CommandSender sender) {
        system.reload();

        sender.sendMessage(Chat.component("&aReloaded markers.yml &8· &7"
                + system.registry().size() + " type(s), "
                + system.registry().categories().size() + " category(ies)."));
    }

    // ─── Tab completion ───────────────────────────────────────────────────────────────────────

    @Override
    public List<String> onTabComplete(
            @NotNull CommandSender sender,
            @NotNull Command command,
            @NotNull String label,
            @NotNull String[] args
    ) {
        if (!sender.hasPermission(PERMISSION)) {
            return List.of();
        }

        if (args.length == 1) {
            return prefixed(List.of("marker"), args[0]);
        }

        if (args.length == 2 && args[0].equalsIgnoreCase("marker")) {
            return prefixed(
                    List.of("edit", "validate", "scan", "set", "info", "list", "reload"), args[1]);
        }

        if (args.length == 3 && args[0].equalsIgnoreCase("marker")
                && (args[1].equalsIgnoreCase("validate") || args[1].equalsIgnoreCase("scan"))) {
            return prefixed(List.of("32", "48", "64", "96"), args[2]);
        }

        // The keys the marker being looked at actually understands, rather than every key any type
        // declares. A builder aiming at a recruiter should be offered "job" and not "schematic".
        if (args.length == 3 && args[0].equalsIgnoreCase("marker")
                && args[1].equalsIgnoreCase("set")) {
            return prefixed(metadataKeysOfTarget(sender), args[2]);
        }

        return List.of();
    }

    /** Metadata keys declared by the type of the marker the sender is looking at. */
    private List<String> metadataKeysOfTarget(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            return List.of();
        }

        Block target = player.getTargetBlockExact(8);

        if (target == null) {
            return List.of();
        }

        List<String> keys = new ArrayList<>(List.of(PlacedMarker.OFFSET, PlacedMarker.YAW));

        system.items().read(target)
                .flatMap(marker -> system.registry().get(marker.typeId()))
                .ifPresent(type -> keys.addAll(type.metadataKeys()));

        return keys;
    }

    private static List<String> prefixed(List<String> options, String typed) {
        String lower = typed.toLowerCase(Locale.ROOT);
        List<String> found = new ArrayList<>();

        for (String option : options) {
            if (option.startsWith(lower)) {
                found.add(option);
            }
        }

        return found;
    }
}
