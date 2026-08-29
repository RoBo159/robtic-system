package org.robtic.dragonbattle.commands;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.dragonbattle.config.MessageCatalog;
import org.robtic.dragonbattle.manager.ArenaManager;
import org.robtic.dragonbattle.manager.BattleManager;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.Perch;
import org.robtic.dragonbattle.model.Region;
import org.robtic.dragonbattle.model.StoredLocation;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * `/dragonbattle` — everything an operator does to set up and run a fight.
 *
 * <h2>One command with verbs</h2>
 *
 * Structured rather than spread across a dozen top-level names, so the whole plugin is discoverable
 * from `/dragonbattle` alone. Every verb that edits an arena takes the arena as its first argument
 * except when the operator has selected one — see {@link #selected} — because typing the name for
 * every one of forty perch additions is how mistakes get made.
 *
 * <h2>Position verbs are in-game only</h2>
 *
 * `setspawn`, `perch add` and the rest read the sender's own position. There is nothing sensible for
 * them to do from the console, so they say so rather than guessing at coordinates.
 */
public final class DragonBattleCommand implements CommandExecutor, TabCompleter {

    private static final List<String> VERBS = List.of(
            // `edit` is an alias for `select`: choosing what you are editing and editing it are the
            // same act, and an operator who reaches for one should not be told it does not exist.
            "create", "delete", "list", "select", "edit", "enable", "disable", "reload",
            "regenerate",
            "setspawn", "playerspawn", "portal", "beacon", "gateway", "crystal", "perch",
            "area", "egg", "start", "stop", "reset", "info");

    /** How far `crystal add` will look for the block being pointed at. */
    private static final int TARGET_RANGE = 64;

    private final ArenaManager arenas;
    private final BattleManager battles;
    private final MessageCatalog messages;
    private final Runnable reload;

    /** Replaces the config files, returning how many were written. See #regenerate. */
    private final java.util.function.IntSupplier regenerate;

    /** The arena each operator is editing, so the name need not be repeated on every command. */
    private final java.util.Map<java.util.UUID, String> selected = new java.util.concurrent.ConcurrentHashMap<>();

    /** First corner of a region selection, per operator. */
    private final java.util.Map<java.util.UUID, org.bukkit.Location> corners = new java.util.concurrent.ConcurrentHashMap<>();

    public DragonBattleCommand(
            ArenaManager arenas,
            BattleManager battles,
            MessageCatalog messages,
            Runnable reload,
            java.util.function.IntSupplier regenerate
    ) {
        this.arenas = arenas;
        this.battles = battles;
        this.messages = messages;
        this.reload = reload;
        this.regenerate = regenerate;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {
        if (args.length == 0) {
            usage(sender);
            return true;
        }

        String verb = args[0].toLowerCase(Locale.ROOT);
        String[] rest = java.util.Arrays.copyOfRange(args, 1, args.length);

        switch (verb) {
            case "create" -> create(sender, rest);
            case "delete" -> delete(sender, rest);
            case "list" -> list(sender);
            case "select", "edit" -> select(sender, rest);
            case "enable" -> setEnabled(sender, rest, true);
            case "disable" -> setEnabled(sender, rest, false);
            case "reload" -> {
                reload.run();
                sender.sendMessage(messages.prefixed("reloaded"));
            }
            case "regenerate" -> regenerate(sender);
            case "info" -> info(sender);
            case "setspawn" -> setPosition(sender, "dragon spawn", Arena::dragonSpawn);
            case "playerspawn" -> setPosition(sender, "player spawn", Arena::playerSpawn);
            case "portal" -> setPosition(sender, "portal centre", Arena::portalCentre);
            case "beacon" -> setPosition(sender, "beacon", Arena::beacon);
            case "crystal" -> crystal(sender, rest);
            case "gateway" -> gateway(sender, rest);
            case "perch" -> perch(sender, rest);
            case "area" -> area(sender, rest);
            case "egg" -> egg(sender, rest);
            case "start" -> start(sender);
            case "stop" -> stop(sender);
            case "reset" -> reset(sender);
            default -> usage(sender);
        }

        return true;
    }

    // ─── Arena lifecycle ──────────────────────────────────────────────────────────────────────

    private void create(CommandSender sender, String[] args) {
        if (args.length == 0) {
            sender.sendMessage(messages.prefixed("usage.create"));
            return;
        }

        String name = args[0];

        arenas.create(name).ifPresentOrElse(
                arena -> {
                    if (sender instanceof Player player) {
                        selected.put(player.getUniqueId(), arena.name());
                    }
                    sender.sendMessage(messages.prefixed("arena.created", "arena", arena.name()));
                },
                () -> sender.sendMessage(messages.prefixed("arena.exists", "arena", name)));
    }

    private void delete(CommandSender sender, String[] args) {
        if (args.length == 0) {
            sender.sendMessage(messages.prefixed("usage.delete"));
            return;
        }

        if (arenas.delete(args[0])) {
            sender.sendMessage(messages.prefixed("arena.deleted", "arena", args[0]));
        } else {
            sender.sendMessage(messages.prefixed("arena.unknown", "arena", args[0]));
        }
    }

    private void list(CommandSender sender) {
        if (arenas.all().isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none"));
            return;
        }

        sender.sendMessage(messages.prefixed("arena.list-header"));

        for (Arena arena : arenas.all()) {
            sender.sendMessage(messages.component("arena.list-entry",
                    "arena", arena.name(),
                    "state", arena.enabled() ? "enabled" : "disabled",
                    "ready", arena.ready() ? "ready" : "incomplete"));
        }
    }

    private void select(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(messages.prefixed("player-only"));
            return;
        }

        if (args.length == 0) {
            sender.sendMessage(messages.prefixed("usage.select"));
            return;
        }

        arenas.get(args[0]).ifPresentOrElse(
                arena -> {
                    selected.put(player.getUniqueId(), arena.name());
                    sender.sendMessage(messages.prefixed("arena.selected", "arena", arena.name()));
                },
                () -> sender.sendMessage(messages.prefixed("arena.unknown", "arena", args[0])));
    }

    private void setEnabled(CommandSender sender, String[] args, boolean value) {
        Optional<Arena> arena = args.length > 0 ? arenas.get(args[0]) : selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        // Enabling an incomplete arena would let players start a ritual that cannot finish, so the
        // problems are named and the change refused rather than deferred to a confusing failure.
        if (value && !arena.get().ready()) {
            sender.sendMessage(messages.prefixed("arena.not-ready",
                    "problems", String.join(", ", arena.get().readinessProblems())));
            return;
        }

        arena.get().enabled(value);
        arenas.save();

        sender.sendMessage(messages.prefixed(value ? "arena.enabled" : "arena.disabled",
                "arena", arena.get().name()));
    }

    /**
     * Replaces the config files with the current version's, keeping the old ones as `.old`.
     *
     * <h2>Why an operator would want this</h2>
     *
     * New keys are merged into an existing file automatically, so this is not needed for an ordinary
     * update. It is needed when a file's *shape* changes — a renamed section leaves the old one
     * sitting unread beside a new one full of defaults, and no amount of merging fixes that.
     *
     * <h2>arenas.yml is never touched</h2>
     *
     * Said here as well as in the code that does the work, because this is the command somebody runs
     * when they are already frustrated, and "will this delete my arenas?" is the question they will
     * have. It will not: arenas are hours of in-game work with no packaged copy to restore, so they
     * are excluded from regeneration entirely.
     */
    private void regenerate(CommandSender sender) {
        int replaced = regenerate.getAsInt();

        if (replaced == 0) {
            sender.sendMessage(messages.prefixed("regenerate-failed"));
            return;
        }

        sender.sendMessage(messages.prefixed("regenerated", "count", String.valueOf(replaced)));
    }

    private void info(CommandSender sender) {
        Optional<Arena> arena = selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        Arena target = arena.get();

        sender.sendMessage(messages.prefixed("arena.info-header", "arena", target.name()));
        sender.sendMessage(messages.component("arena.info-line", "key", "enabled",
                "value", String.valueOf(target.enabled())));
        sender.sendMessage(messages.component("arena.info-line", "key", "dragon spawn",
                "value", target.dragonSpawn().map(StoredLocation::describe).orElse("unset")));
        sender.sendMessage(messages.component("arena.info-line", "key", "player spawn",
                "value", target.playerSpawn().map(StoredLocation::describe).orElse("unset")));
        sender.sendMessage(messages.component("arena.info-line", "key", "portal",
                "value", target.portalCentre().map(StoredLocation::describe).orElse("unset")));
        sender.sendMessage(messages.component("arena.info-line", "key", "crystals",
                "value", String.valueOf(target.crystals().size())));
        sender.sendMessage(messages.component("arena.info-line", "key", "perches",
                "value", String.valueOf(target.perches().size())));
        sender.sendMessage(messages.component("arena.info-line", "key", "gateways",
                "value", String.valueOf(target.gateways().size())));

        if (!target.ready()) {
            sender.sendMessage(messages.prefixed("arena.not-ready",
                    "problems", String.join(", ", target.readinessProblems())));
        }
    }

    // ─── Positions ────────────────────────────────────────────────────────────────────────────

    /** Shared by every single-position verb, which differ only in which field they write. */
    private void setPosition(CommandSender sender, String what, java.util.function.BiConsumer<Arena, StoredLocation> setter) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(messages.prefixed("player-only"));
            return;
        }

        Optional<Arena> arena = selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        StoredLocation location = StoredLocation.of(player.getLocation());
        setter.accept(arena.get(), location);
        arenas.save();

        sender.sendMessage(messages.prefixed("position.set", "what", what, "where", location.describe()));
    }

    /**
     * `/dragonbattle crystal add` records the block being looked at, not the one being stood on.
     *
     * A crystal sits on top of a block an operator points at from a distance — usually the obsidian
     * pillar it belongs on. Recording their feet would put every crystal position on the floor they
     * happened to be standing on, and they would have to climb each pillar to configure it.
     */
    private void crystal(CommandSender sender, String[] args) {
        String action = args.length == 0 ? "list" : args[0].toLowerCase(Locale.ROOT);

        if (action.equals("add") && sender instanceof Player player) {
            Optional<Arena> arena = selectedArena(sender);

            if (arena.isEmpty()) {
                sender.sendMessage(messages.prefixed("arena.none-selected"));
                return;
            }

            org.bukkit.block.Block target = player.getTargetBlockExact(TARGET_RANGE);

            if (target == null) {
                sender.sendMessage(messages.prefixed("crystal.no-target", "range", String.valueOf(TARGET_RANGE)));
                return;
            }

            // One above the block they are looking at: that is where the crystal will stand, and it
            // is where the ritual check will look for it.
            StoredLocation location = StoredLocation.of(target.getLocation().add(0.5, 1, 0.5));

            arena.get().addCrystal(location);
            arenas.save();

            sender.sendMessage(messages.prefixed("list.added",
                    "what", "crystal",
                    "index", String.valueOf(arena.get().crystals().size() - 1),
                    "where", location.describe()));
            return;
        }

        listVerb(sender, args, "crystal",
                Arena::addCrystal, Arena::removeCrystal, Arena::crystals);
    }

    private void gateway(CommandSender sender, String[] args) {
        listVerb(sender, args, "gateway",
                Arena::addGateway, Arena::removeGateway, Arena::gateways);
    }

    /**
     * `add` / `remove <index>` / `list`, shared by crystals and gateways.
     *
     * They differ only in which collection they touch and what they are called, and two copies of
     * index parsing is exactly where an off-by-one would eventually live in one of them.
     */
    private void listVerb(
            CommandSender sender,
            String[] args,
            String what,
            java.util.function.BiConsumer<Arena, StoredLocation> add,
            java.util.function.BiPredicate<Arena, Integer> remove,
            java.util.function.Function<Arena, List<StoredLocation>> all
    ) {
        Optional<Arena> arena = selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        String action = args.length == 0 ? "list" : args[0].toLowerCase(Locale.ROOT);

        switch (action) {
            case "add" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage(messages.prefixed("player-only"));
                    return;
                }

                StoredLocation location = StoredLocation.of(player.getLocation());
                add.accept(arena.get(), location);
                arenas.save();

                sender.sendMessage(messages.prefixed("list.added",
                        "what", what,
                        "index", String.valueOf(all.apply(arena.get()).size() - 1),
                        "where", location.describe()));
            }

            case "remove" -> {
                if (args.length < 2) {
                    sender.sendMessage(messages.prefixed("usage.remove", "what", what));
                    return;
                }

                try {
                    int index = Integer.parseInt(args[1]);

                    if (remove.test(arena.get(), index)) {
                        arenas.save();
                        sender.sendMessage(messages.prefixed("list.removed", "what", what,
                                "index", String.valueOf(index)));
                    } else {
                        sender.sendMessage(messages.prefixed("list.no-such-index",
                                "what", what, "index", String.valueOf(index)));
                    }
                } catch (NumberFormatException notANumber) {
                    sender.sendMessage(messages.prefixed("list.not-a-number", "value", args[1]));
                }
            }

            default -> {
                List<StoredLocation> entries = all.apply(arena.get());

                if (entries.isEmpty()) {
                    sender.sendMessage(messages.prefixed("list.empty", "what", what));
                    return;
                }

                sender.sendMessage(messages.prefixed("list.header", "what", what,
                        "count", String.valueOf(entries.size())));

                for (int index = 0; index < entries.size(); index++) {
                    sender.sendMessage(messages.component("list.entry",
                            "index", String.valueOf(index),
                            "where", entries.get(index).describe()));
                }
            }
        }
    }

    private void perch(CommandSender sender, String[] args) {
        Optional<Arena> arena = selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        String action = args.length == 0 ? "list" : args[0].toLowerCase(Locale.ROOT);

        switch (action) {
            case "add" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage(messages.prefixed("player-only"));
                    return;
                }

                // Named by the operator when supplied, generated otherwise. A name is what makes a
                // perch removable and adjustable later without counting entries in a list.
                String id = args.length > 1
                        ? args[1]
                        : "perch" + (arena.get().perches().size() + 1);

                Perch created = Perch.of(id, StoredLocation.of(player.getLocation()),
                        arena.get().settings().perchDefaults());

                arena.get().addPerch(created);
                arenas.save();

                sender.sendMessage(messages.prefixed("perch.added", "perch", created.describe()));
            }

            case "remove" -> {
                if (args.length < 2) {
                    sender.sendMessage(messages.prefixed("usage.perch-remove"));
                    return;
                }

                if (arena.get().removePerch(args[1])) {
                    arenas.save();
                    sender.sendMessage(messages.prefixed("perch.removed", "perch", args[1]));
                } else {
                    sender.sendMessage(messages.prefixed("perch.unknown", "perch", args[1]));
                }
            }

            default -> {
                if (arena.get().perches().isEmpty()) {
                    sender.sendMessage(messages.prefixed("perch.none"));
                    return;
                }

                sender.sendMessage(messages.prefixed("perch.header",
                        "count", String.valueOf(arena.get().perches().size())));

                for (Perch entry : arena.get().perches()) {
                    sender.sendMessage(messages.component("perch.entry", "perch", entry.describe()));
                }
            }
        }
    }


    // ─── The arena cuboid ─────────────────────────────────────────────────────────────────────

    /**
     * `/dragonbattle area pos1|pos2`, the two corners the fight is confined to.
     *
     * The second corner completes the cuboid — there is no separate `create`, because the pair
     * <em>is</em> the area and asking for a third command to confirm it would only be a step to
     * forget.
     */
    private void area(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(messages.prefixed("player-only"));
            return;
        }

        Optional<Arena> arena = selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        String action = args.length == 0 ? "info" : args[0].toLowerCase(Locale.ROOT);

        switch (action) {
            case "pos1" -> {
                corners.put(player.getUniqueId(), player.getLocation());
                sender.sendMessage(messages.prefixed("area.pos1"));
            }

            case "pos2" -> {
                org.bukkit.Location first = corners.get(player.getUniqueId());

                if (first == null) {
                    sender.sendMessage(messages.prefixed("area.no-pos1"));
                    return;
                }

                if (!first.getWorld().equals(player.getWorld())) {
                    // A cuboid spanning two worlds is not a shape. Refused rather than silently
                    // taking the second world, which would put the arena somewhere the operator
                    // never stood.
                    sender.sendMessage(messages.prefixed("area.different-world"));
                    return;
                }

                Region bounds = Region.between(first, player.getLocation());

                arena.get().bounds(bounds);
                arenas.save();
                corners.remove(player.getUniqueId());

                sender.sendMessage(messages.prefixed("area.set", "region", bounds.describe()));
                sender.sendMessage(messages.prefixed("area.builds-cleared"));
            }

            default -> arena.get().bounds().ifPresentOrElse(
                    bounds -> {
                        sender.sendMessage(messages.prefixed("area.current", "region", bounds.describe()));
                        sender.sendMessage(messages.component("area.tracked",
                                "count", String.valueOf(arena.get().builds().size())));
                    },
                    () -> sender.sendMessage(messages.prefixed("area.unset")));
        }
    }

    // ─── Dragon egg ───────────────────────────────────────────────────────────────────────────

    private void egg(CommandSender sender, String[] args) {
        Optional<Arena> arena = selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        String action = args.length == 0 ? "info" : args[0].toLowerCase(Locale.ROOT);

        switch (action) {
            case "set" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage(messages.prefixed("player-only"));
                    return;
                }

                StoredLocation location = StoredLocation.of(player.getLocation());
                arena.get().egg(location);
                arenas.save();

                sender.sendMessage(messages.prefixed("egg.set", "where", location.describe()));
            }

            case "remove" -> {
                arena.get().egg(null);
                arenas.save();
                sender.sendMessage(messages.prefixed("egg.removed"));
            }

            case "tp" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage(messages.prefixed("player-only"));
                    return;
                }

                arena.get().egg()
                        .flatMap(StoredLocation::toBukkit)
                        .ifPresentOrElse(
                                player::teleport,
                                () -> sender.sendMessage(messages.prefixed("egg.unset")));
            }

            default -> arena.get().egg().ifPresentOrElse(
                    location -> sender.sendMessage(messages.prefixed("egg.current",
                            "where", location.describe())),
                    () -> sender.sendMessage(messages.prefixed("egg.unset")));
        }
    }

    // ─── Running a battle ─────────────────────────────────────────────────────────────────────

    private void start(CommandSender sender) {
        Optional<Arena> arena = selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        long now = org.bukkit.Bukkit.getCurrentTick();

        battles.start(arena.get(), now).ifPresentOrElse(
                problem -> sender.sendMessage(messages.prefixed("battle.cannot-start", "reason", problem)),
                () -> sender.sendMessage(messages.prefixed("battle.started", "arena", arena.get().name())));
    }

    private void stop(CommandSender sender) {
        Optional<Arena> arena = selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        battles.stop(arena.get(), true);
        sender.sendMessage(messages.prefixed("battle.stopped", "arena", arena.get().name()));
    }

    private void reset(CommandSender sender) {
        Optional<Arena> arena = selectedArena(sender);

        if (arena.isEmpty()) {
            sender.sendMessage(messages.prefixed("arena.none-selected"));
            return;
        }

        // The dragon is removed as well: a reset that left one flying would leave the arena idle
        // with a boss still attacking, which is the worst of both.
        battles.stop(arena.get(), true);
        sender.sendMessage(messages.prefixed("battle.reset", "arena", arena.get().name()));
    }

    // ─── Plumbing ─────────────────────────────────────────────────────────────────────────────

    private Optional<Arena> selectedArena(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            // The console has no selection, so it falls back to the only arena when there is exactly
            // one — which is the common case on a server that runs a single fight.
            return arenas.all().size() == 1 ? Optional.of(arenas.all().iterator().next()) : Optional.empty();
        }

        String name = selected.get(player.getUniqueId());

        if (name == null) {
            return arenas.all().size() == 1 ? Optional.of(arenas.all().iterator().next()) : Optional.empty();
        }

        return arenas.get(name);
    }

    private void usage(CommandSender sender) {
        for (String line : messages.text("usage.header").split("\n")) {
            sender.sendMessage(MessageCatalog.render(line));
        }
    }

    public void forget(java.util.UUID uuid) {
        selected.remove(uuid);
        corners.remove(uuid);
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                      @NotNull String label, String[] args) {
        if (args.length == 1) {
            String prefix = args[0].toLowerCase(Locale.ROOT);
            return VERBS.stream().filter(verb -> verb.startsWith(prefix)).toList();
        }

        if (args.length == 2) {
            String verb = args[0].toLowerCase(Locale.ROOT);
            String prefix = args[1].toLowerCase(Locale.ROOT);

            if (List.of("select", "delete", "enable", "disable").contains(verb)) {
                return arenas.all().stream()
                        .map(Arena::name)
                        .filter(name -> name.toLowerCase(Locale.ROOT).startsWith(prefix))
                        .toList();
            }

            if (List.of("crystal", "gateway", "perch").contains(verb)) {
                return filtered(List.of("add", "remove", "list"), prefix);
            }

            if (verb.equals("area")) {
                return filtered(List.of("pos1", "pos2", "info"), prefix);
            }

            if (verb.equals("egg")) {
                return filtered(List.of("set", "remove", "tp", "info"), prefix);
            }
        }

        return List.of();
    }

    private static List<String> filtered(List<String> options, String prefix) {
        List<String> matches = new ArrayList<>();
        for (String option : options) {
            if (option.startsWith(prefix)) {
                matches.add(option);
            }
        }
        return matches;
    }
}
