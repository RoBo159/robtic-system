package org.robtic.minecraft.structure;

import org.bukkit.Location;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.structure.api.MarkerCategory;
import org.robtic.minecraft.structure.api.MarkerProblem;
import org.robtic.minecraft.structure.api.MarkerRegistry;
import org.robtic.minecraft.structure.api.MarkerSet;
import org.robtic.minecraft.structure.api.MarkerType;
import org.robtic.minecraft.structure.command.MarkerCommand;
import org.robtic.minecraft.structure.config.MarkerSettings;
import org.robtic.minecraft.structure.events.StructureScannedEvent;
import org.robtic.minecraft.structure.gui.MarkerMenu;
import org.robtic.minecraft.structure.gui.MarkerMenuListener;
import org.robtic.minecraft.structure.item.MarkerItemFactory;
import org.robtic.minecraft.structure.listener.MarkerBlockListener;
import org.robtic.minecraft.structure.listener.MarkerDiscoveryListener;
import org.robtic.minecraft.structure.scan.ScanReport;
import org.robtic.minecraft.structure.scan.StructureScanner;
import org.robtic.minecraft.structure.validate.MarkerValidator;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * The building marker system: where every part of it is wired together.
 *
 * <h2>What this module is for</h2>
 *
 * A builder builds a structure by hand, drops markers in it where things should happen, and saves it
 * as a schematic. BetterStructures generates that schematic in the world. This module notices, reads
 * the markers, checks them, and announces what it found. It does not know what a workspace is, what
 * a dungeon is, or what a guild hall is — those are systems that listen to
 * {@link StructureScannedEvent} and pick out the markers they care about.
 *
 * Nothing anywhere is a hard-coded coordinate. A structure's area comes from its corner markers, its
 * NPC positions come from its NPC markers, and which NPC stands on which marker comes from a role
 * name in configuration. Adding a new kind of marker is an entry in {@code markers.yml}.
 *
 * <h2>Scanning happens three times, and never during play</h2>
 *
 * A structure generates, an admin registers one by hand, or somebody runs validation. That is the
 * complete list. Once a structure has been read, everything about it lives in a {@link MarkerSet}
 * that whoever listened has persisted, and the marker blocks are cleared out of the world. A player
 * walking through a finished building causes no scanning at all, because there is nothing left to
 * scan and nothing left to look at.
 */
public final class StructureMarkerSystem {

    private final Plugin plugin;
    private final Supplier<FileConfiguration> config;

    private final MarkerRegistry registry;
    private final MarkerItemFactory items;
    private final MarkerValidator validator;
    private final StructureScanner scanner;
    private final MarkerMenu menu;

    private volatile MarkerSettings settings;

    /**
     * Structures already announced this session.
     *
     * Chunks load repeatedly, and with {@code keep-after-scan} on, the markers are still there every
     * time. Without this the same building would be announced on every unload and reload for as long
     * as the server ran.
     *
     * Deliberately not persisted. Across a restart the marker blocks are normally gone, so a second
     * scan finds nothing anyway; and a listener that stores structures has its own record, which is
     * a better authority than a cache this class would have to keep in step with it. Listeners must
     * therefore be idempotent — see {@link StructureScannedEvent}.
     */
    private final Set<String> announced = ConcurrentHashMap.newKeySet();

    /**
     * Chunks automatic discovery has already looked at this session.
     *
     * {@link #announced} cannot cover the failure case: a structure that fails validation has no
     * region, so it has no id to remember it by. Without this, a single building missing one corner
     * marker would be re-scanned and re-logged on every chunk load, for as long as the server ran —
     * turning one builder's mistake into a console full of identical warnings and a scan that repeats
     * forever.
     *
     * Keyed by chunk rather than by structure for the same reason: at the moment the decision has to
     * be made, the chunk is the only thing that is known.
     */
    private final Set<String> visited = ConcurrentHashMap.newKeySet();

    /**
     * Marker types other modules registered from code.
     *
     * A reload clears the registry and re-reads the file, which would otherwise silently drop every
     * type a module added at enable — and those modules have already run, so nothing would put them
     * back until a restart.
     */
    private final List<MarkerType> fromCode = new ArrayList<>();

    /**
     * Re-reads the configuration files from disk.
     *
     * Injected because {@code config.raw(...)} hands back a parse that is cached until the whole
     * registry is reloaded. Without this, {@code /workspace marker reload} would re-parse the copy
     * already in memory and report success having changed nothing — which is a far worse failure
     * than an error, because the operator believes their edit took effect.
     */
    private final Runnable reloadFiles;

    public StructureMarkerSystem(
            Plugin plugin,
            Supplier<FileConfiguration> config,
            Runnable reloadFiles
    ) {
        this.plugin = plugin;
        this.config = config;
        this.reloadFiles = reloadFiles == null ? () -> {
        } : reloadFiles;

        this.settings = new MarkerSettings(section(), plugin.getLogger());

        this.registry = new MarkerRegistry(plugin.getLogger());
        this.items = new MarkerItemFactory(plugin);
        this.validator = new MarkerValidator(registry);
        this.scanner = new StructureScanner(items, validator, this::settings);
        this.menu = new MarkerMenu(registry, items, this::settings);
    }

    private org.bukkit.configuration.ConfigurationSection section() {
        FileConfiguration file = config.get();

        return file == null ? null : file.getConfigurationSection("markers");
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────────────────────

    public void enable() {
        load();

        var manager = plugin.getServer().getPluginManager();

        manager.registerEvents(new MarkerMenuListener(menu, registry, this::settings), plugin);
        manager.registerEvents(new MarkerBlockListener(plugin, registry, items, this::settings), plugin);
        manager.registerEvents(new MarkerDiscoveryListener(plugin, this, items, this::settings), plugin);

        var command = plugin.getServer().getPluginCommand("workspace");

        if (command == null) {
            plugin.getLogger().warning("The command \"workspace\" is not declared in plugin.yml, so"
                    + " /workspace marker edit will not work.");
        } else {
            MarkerCommand executor = new MarkerCommand(this, menu, this::settings);

            command.setExecutor(executor);
            command.setTabCompleter(executor);
        }

        plugin.getLogger().info("Markers ready: " + registry.size() + " type(s), marker block = "
                + settings.blockMaterial() + ".");
    }

    public void reload() {
        reloadFiles.run();
        load();

        // A reload is how an operator fixes the thing that made a structure fail — a missing type, a
        // wrong role, a bad cardinality. Keeping the visited set would mean their fix did nothing
        // until a restart, and they would reasonably conclude the reload was broken.
        //
        // The announced set is deliberately kept: those structures were registered successfully, and
        // whoever listened has already stored them. Clearing it would re-announce every building the
        // server has seen this session.
        visited.clear();
    }

    private void load() {
        this.settings = new MarkerSettings(section(), plugin.getLogger());

        registry.clear();

        settings.categories().forEach(registry::register);
        registry.registerAll(settings.types());

        // Replayed after the file, so a config entry and a code registration with the same id
        // resolve the same way on a reload as they did at boot: the code one wins, because it is
        // registered second and registration replaces.
        registry.registerAll(fromCode);

        warnAboutUnusableCategories();
    }

    /**
     * Names categories that markers reference but nobody declared.
     *
     * They work — the registry substitutes a placeholder — but the menu tab will be unlabelled, and
     * that is nearly always a typo rather than a decision.
     */
    private void warnAboutUnusableCategories() {
        List<String> declared = registry.categories().stream().map(MarkerCategory::id).toList();

        for (String used : registry.usedCategories()) {
            if (!declared.contains(used)) {
                plugin.getLogger().warning("markers.yml: marker types reference the category \""
                        + used + "\", which is not declared under categories.");
            }
        }
    }

    public void disable() {
        announced.clear();
        visited.clear();
    }

    // ─── Registration from code ───────────────────────────────────────────────────────────────

    /**
     * Adds a marker type from another module, surviving reloads.
     *
     * The extension point named in the requirements: a dungeon system registers its own marker types
     * at enable and everything else — the menu, the scan, the validation, the events — picks them up
     * with no edit to this package.
     */
    public boolean register(MarkerType type) {
        if (type == null) {
            return false;
        }

        fromCode.removeIf(existing -> existing.id().equals(type.id()));
        fromCode.add(type);

        return registry.register(type);
    }

    /** Adds a category from another module, surviving reloads. */
    public boolean register(MarkerCategory category) {
        return registry.register(category);
    }

    // ─── Scanning ─────────────────────────────────────────────────────────────────────────────

    /**
     * Called when a structure is noticed in the world.
     *
     * The one entry point automatic discovery uses. Everything it does is idempotent per structure
     * id, so a chunk that loads and unloads repeatedly does not announce the same building twice.
     */
    public void discover(Location near) {
        if (!settings.enabled() || near.getWorld() == null) {
            return;
        }

        // Claimed before the scan rather than after it, so a chunk that loads twice in quick
        // succession cannot start two scans of the same building.
        String chunk = near.getWorld().getName()
                + ":" + (near.getBlockX() >> 4)
                + ":" + (near.getBlockZ() >> 4);

        if (!visited.add(chunk)) {
            return;
        }

        ScanReport report = scanner.scanAround(near, settings.scanRadius());

        if (!report.foundAnything()) {
            return;
        }

        if (report.ok() && !announced.add(report.set().orElseThrow().structureId())) {
            return;
        }

        logProblems(report, near);
        publish(report, true);
    }

    /** Scans and registers on demand, for an admin fixing a structure that did not take. */
    public ScanReport scanAndRegister(Location near, int radius) {
        ScanReport report = scanner.scanAround(near, radius);

        if (report.ok()) {
            announced.add(report.set().orElseThrow().structureId());
            publish(report, false);
        }

        return report;
    }

    /**
     * Reads a structure and changes nothing.
     *
     * No event, no clearing, no registration. This is what a builder runs in a build world, over and
     * over, while they are still moving markers around.
     */
    public ScanReport validate(Location near, int radius) {
        return scanner.scanAround(near, radius);
    }

    /**
     * Announces a scanned structure and clears its markers.
     *
     * The clearing happens after the event rather than before it, so a listener that wants to read
     * the blocks themselves — to copy a sign's text, or to check something this system does not
     * model — still can. By the time the event returns, the marker set is the only record.
     */
    private void publish(ScanReport report, boolean automatic) {
        plugin.getServer().getPluginManager().callEvent(new StructureScannedEvent(report, automatic));

        report.set().ifPresent(set -> {
            int cleared = scanner.clear(set);

            if (cleared > 0) {
                plugin.getLogger().fine("Cleared " + cleared + " marker block(s) for structure "
                        + set.structureId() + ".");
            }
        });
    }

    /**
     * Puts a broken structure in the log, once.
     *
     * A generated building that cannot be registered is invisible otherwise: it looks completely
     * normal, and nobody finds out it is inert until a player walks up to it expecting an NPC. The
     * position is included because the operator's next question is always "which one".
     */
    private void logProblems(ScanReport report, Location near) {
        if (report.ok()) {
            return;
        }

        plugin.getLogger().warning("A structure near " + near.getBlockX() + ", " + near.getBlockY()
                + ", " + near.getBlockZ() + " in " + near.getWorld().getName()
                + " could not be registered: " + report.summary());

        for (MarkerProblem problem : report.fatal()) {
            plugin.getLogger().warning("  " + problem.describe());
        }
    }

    // ─── Accessors ────────────────────────────────────────────────────────────────────────────

    public MarkerRegistry registry() {
        return registry;
    }

    public MarkerItemFactory items() {
        return items;
    }

    public MarkerValidator validator() {
        return validator;
    }

    public StructureScanner scanner() {
        return scanner;
    }

    public MarkerMenu menu() {
        return menu;
    }

    public MarkerSettings settings() {
        return settings;
    }

    /** Whether a structure has already been announced this session. */
    public boolean announced(MarkerSet set) {
        return announced.contains(set.structureId());
    }
}
