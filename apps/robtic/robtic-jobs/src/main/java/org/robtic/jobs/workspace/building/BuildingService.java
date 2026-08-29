package org.robtic.jobs.workspace.building;

import org.bukkit.Location;
import org.bukkit.plugin.Plugin;
import org.robtic.jobs.workspace.BaseLevel;
import org.robtic.jobs.workspace.Workspace;
import org.robtic.jobs.workspace.WorkspaceService;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * Replaces a business's building when it reaches a new base level.
 *
 * <h2>What a replacement is allowed to touch: the blocks, and nothing else</h2>
 *
 * This is the whole design, and it is enforced by what this class can reach rather than by care.
 * It is handed a {@link Workspace} and a {@link BaseLevel} and it has no way to write either. So
 * ownership, storage, purchased upgrades, statistics, profession data, licences and worker records
 * cannot be lost here — not because the paste is careful, but because there is no code path from a
 * paste to any of them.
 *
 * NPCs are the one exception, and they are handled by the caller: {@code WorkspaceService} runs its
 * staffing pass in this service's callback, so the figures are placed after the blocks land rather
 * than being buried by them.
 *
 * <h2>The record is already committed before this runs</h2>
 *
 * A paste that fails leaves a business at its new level in a building that still looks like the old
 * one. That is deliberate and it is the right way round: the alternative is unwinding a purchase the
 * player has already been charged for because a file was missing, which turns a cosmetic problem
 * into a financial one.
 *
 * <h2>Level 1 has no schematic</h2>
 *
 * The first building is whatever BetterStructures generated and the player claimed. Robtic manages
 * every later one. A level that names no schematic is therefore normal rather than a misconfiguration
 * — it means "leave the building alone" — and this reports nothing for it.
 */
public final class BuildingService implements WorkspaceService.BuildingPaster {

    private final Plugin plugin;
    private final SchematicPaster paster;
    private final Path directory;

    /**
     * Workspaces with a paste in flight.
     *
     * A paste is slow enough that a second one can be requested before the first finishes — two
     * upgrades bought in quick succession, or an operator running a repair. Two pastes racing over
     * the same blocks produce a building that is half of each, so the second is refused rather than
     * queued: the level it would have drawn is already superseded by the one that will finish.
     */
    private final Set<String> pasting = ConcurrentHashMap.newKeySet();

    /**
     * Schematic names already reported as missing.
     *
     * A missing file is reported once, not once per upgrade. Left unbounded it would be a log line
     * every time anybody reached that level, which is how a real problem becomes invisible.
     */
    private final Set<String> reportedMissing = ConcurrentHashMap.newKeySet();

    public BuildingService(Plugin plugin, SchematicPaster paster, Path directory) {
        this.plugin = plugin;
        this.paster = paster;
        this.directory = directory;
    }

    /**
     * Creates the schematic directory and says what backend is in use.
     *
     * Called once at enable. The directory is created even with no backend installed, so an operator
     * has somewhere obvious to put files before installing one.
     */
    public void prepare() {
        try {
            Files.createDirectories(directory);
        } catch (java.io.IOException failure) {
            plugin.getLogger().warning("Could not create the schematic directory " + directory
                    + " (" + failure.getMessage() + "). Base-level buildings will not be replaced.");
            return;
        }

        if (paster.available()) {
            plugin.getLogger().info("Base-level buildings will be pasted with " + paster.describe()
                    + ", from " + directory + ".");
        } else {
            plugin.getLogger().info("No paste backend is installed, so base levels will not change"
                    + " how a building looks. Everything else about them works. Install WorldEdit or"
                    + " FastAsyncWorldEdit to enable it.");
        }
    }

    @Override
    public void paste(Workspace workspace, BaseLevel level, Consumer<Boolean> whenDone) {
        if (!level.hasSchematic() || !paster.available()) {
            whenDone.accept(false);
            return;
        }

        Optional<Location> anchor = workspace.anchor().toLocation();

        if (anchor.isEmpty()) {
            // The world is not loaded. Nothing can be drawn, and there is nothing to repair later —
            // the building simply keeps its previous appearance.
            whenDone.accept(false);
            return;
        }

        Path schematic = resolve(level.schematic());

        if (schematic == null) {
            whenDone.accept(false);
            return;
        }

        if (!pasting.add(workspace.id())) {
            whenDone.accept(false);
            return;
        }

        paster.paste(schematic, anchor.get(), pasted -> {
            pasting.remove(workspace.id());
            whenDone.accept(pasted);
        });
    }

    /**
     * Turns a configured name into a file inside the schematic directory.
     *
     * <h2>The path check is not paranoia</h2>
     *
     * The name comes from a configuration file, which is trusted, but it is joined onto a directory
     * and handed to a file reader. Normalising and then confirming the result is still inside the
     * directory costs nothing and means a stray {@code ../} in an edited config reads a file rather
     * than reading a file <em>anywhere</em>.
     *
     * @return null when the file is missing or escapes the directory, having reported it once
     */
    private Path resolve(String name) {
        Path candidate = directory.resolve(name).normalize();

        if (!candidate.startsWith(directory.normalize())) {
            if (reportedMissing.add(name)) {
                plugin.getLogger().warning("workspace.yml names the schematic \"" + name
                        + "\", which resolves outside the schematic directory. It was ignored.");
            }
            return null;
        }

        if (!Files.isRegularFile(candidate)) {
            if (reportedMissing.add(name)) {
                plugin.getLogger().warning("The schematic \"" + name + "\" is named by a base level"
                        + " but does not exist in " + directory + ". Businesses reaching that level"
                        + " keep their previous building; everything else about the level works.");
            }
            return null;
        }

        return candidate;
    }

    /**
     * Forgets which files were reported missing, so a reload reports them again.
     *
     * Without this an operator who adds the missing schematic and reloads gets no confirmation
     * either way, and one who fixes a different level's name never learns it is still wrong.
     */
    public void reload() {
        reportedMissing.clear();
    }
}
