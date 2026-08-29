package org.robtic.world.validate;

import org.robtic.world.api.MarkerCardinality;
import org.robtic.world.api.MarkerProblem;
import org.robtic.world.api.MarkerRegistry;
import org.robtic.world.api.MarkerType;
import org.robtic.world.api.PlacedMarker;
import org.robtic.world.api.StructureRegion;
import org.robtic.world.item.MarkerItemFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Checks a set of markers and says what is wrong with it.
 *
 * <h2>Every rule is read from the marker types, not written here</h2>
 *
 * "Missing origin", "duplicate origin", "missing seller", "duplicate NPC slot" look like four rules
 * and are two: a count that is too low, and a count that is too high. Both come from
 * {@link MarkerCardinality} and {@link MarkerType#required()}, which are configuration. A marker type
 * invented next year is validated by this class with no edit to it, which is the whole point of the
 * registry.
 *
 * The only thing hard-coded here is what to do about the region, because the region is the one piece
 * of structure that is not itself a marker.
 *
 * <h2>Fatal versus warning</h2>
 *
 * Fatal means the structure cannot be registered: no region, no required marker, or an ambiguity
 * nothing can resolve. A warning means it will work but a builder probably did not mean it. The
 * distinction matters because these run at two very different moments — a builder running
 * {@code /workspace marker validate} wants every nit, and a generated building at 3am wants a
 * yes-or-no answer with the reason in the log.
 *
 * <h2>Duplicates are fatal on purpose</h2>
 *
 * Two seller markers in one building have no correct resolution. Picking the first is arbitrary,
 * picking neither is silently broken, and picking both spawns two NPCs on top of each other. Refusing
 * the structure and naming both positions is the only outcome a builder can act on — and because
 * validation is available before the schematic is ever saved, it is a problem they can find in the
 * build world rather than in production.
 */
public final class MarkerValidator {

    private final MarkerRegistry registry;

    public MarkerValidator(MarkerRegistry registry) {
        this.registry = registry;
    }

    /**
     * Checks everything.
     *
     * @param markers   every marker found, including ones whose type is not registered
     * @param region    the region derived from the corner markers, when one could be derived
     * @param maxVolume the largest region that will be accepted, in blocks; 0 disables the check
     */
    public List<MarkerProblem> validate(
            List<PlacedMarker> markers,
            Optional<StructureRegion> region,
            long maxVolume
    ) {
        List<MarkerProblem> problems = new ArrayList<>();

        checkTypes(markers, problems);
        checkDuplicateIds(markers, problems);
        checkCorners(markers, problems);
        checkCounts(markers, problems);
        checkRegion(markers, region, maxVolume, problems);

        return List.copyOf(problems);
    }

    /**
     * Two markers claiming to be the same placement.
     *
     * <h2>How this happens, given the ids are UUIDs</h2>
     *
     * Not by collision. A marker id is minted when the block is placed, and it is then copied
     * wholesale by anything that copies the block: a WorldEdit {@code //copy} and {@code //paste} of
     * a room, a schematic stamped down twice inside one structure, a builder cloning a wing of a
     * building rather than re-placing its markers. All of those are ordinary things to do, and all of
     * them produce two markers with one id.
     *
     * It matters because the id is what everything downstream uses to name an individual marker — in
     * a log line, in a validation message, and in the stored record that outlives the block. Two
     * markers sharing one breaks that reference in a way nothing later can detect, because by then
     * the blocks are gone and only the set remains.
     *
     * <h2>A warning, not a refusal</h2>
     *
     * Every consumer addresses markers by type and by role rather than by id, so a duplicate does not
     * stop a structure working today — and refusing a building for it would fail schematics that have
     * been in production for months. The message names both positions so the builder can replace one,
     * which is a thirty-second fix once somebody knows to make it.
     *
     * A blank id is skipped rather than reported: markers restored from an older stored record have
     * no id at all, and that is a separate and already-harmless condition.
     */
    private void checkDuplicateIds(List<PlacedMarker> markers, List<MarkerProblem> problems) {
        Map<String, List<PlacedMarker>> byId = new LinkedHashMap<>();

        for (PlacedMarker marker : markers) {
            if (!marker.markerId().isBlank()) {
                byId.computeIfAbsent(marker.markerId(), key -> new ArrayList<>()).add(marker);
            }
        }

        byId.forEach((markerId, sharing) -> {
            if (sharing.size() < 2) {
                return;
            }

            for (PlacedMarker duplicate : sharing) {
                problems.add(MarkerProblem.warning("duplicate-marker-id",
                        "This marker shares its identity with " + (sharing.size() - 1) + " other"
                                + " marker(s) in the structure, which usually means part of the"
                                + " building was copied rather than re-marked. Replace all but one"
                                + " with a fresh marker from the menu.",
                        duplicate.point()));
            }
        });
    }

    // ─── Per-marker checks ────────────────────────────────────────────────────────────────────

    /**
     * Unknown types, unusable versions and metadata nobody declared.
     *
     * All warnings. An unknown type is very often a schematic built against a newer plugin, and a
     * structure that still has its origin, its end and its recruiter is perfectly usable without
     * whatever the unknown marker was going to add. Refusing it would mean a plugin downgrade
     * silently broke every building on the server.
     */
    private void checkTypes(List<PlacedMarker> markers, List<MarkerProblem> problems) {
        for (PlacedMarker marker : markers) {
            Optional<MarkerType> found = registry.get(marker.typeId());

            if (found.isEmpty()) {
                problems.add(MarkerProblem.warning("unknown-type",
                        "Marker type \"" + marker.typeId() + "\" is not registered, so this marker"
                                + " does nothing. It was probably placed by a newer version of the"
                                + " plugin, or its type was removed from markers.yml.",
                        marker.point()));
                continue;
            }

            if (marker.version() > MarkerItemFactory.VERSION) {
                problems.add(MarkerProblem.warning("future-version",
                        "Marker \"" + marker.typeId() + "\" was written in format version "
                                + marker.version() + ", but this plugin understands version "
                                + MarkerItemFactory.VERSION + ". It is being ignored rather than"
                                + " guessed at.",
                        marker.point()));
                continue;
            }

            if (marker.version() < 1) {
                problems.add(MarkerProblem.warning("invalid-version",
                        "Marker \"" + marker.typeId() + "\" has an invalid format version ("
                                + marker.version() + "). Replace it with a fresh marker.",
                        marker.point()));
            }

            checkMetadata(marker, found.get(), problems);
        }
    }

    /**
     * Metadata keys the type never declared.
     *
     * A warning rather than an error, because writing metadata ahead of the feature that will read
     * it is a legitimate thing for a builder to do and this system is explicitly meant to allow it.
     * Reporting it still catches the far more common case, which is a typo.
     */
    private void checkMetadata(PlacedMarker marker, MarkerType type, List<MarkerProblem> problems) {
        for (String key : marker.metadata().keySet()) {
            if (key.equals(PlacedMarker.OFFSET) || key.equals(PlacedMarker.YAW)) {
                // Understood by every marker, so never declared per type.
                continue;
            }

            if (!type.metadataKeys().contains(key)) {
                problems.add(MarkerProblem.warning("unknown-metadata",
                        "Marker \"" + type.id() + "\" carries metadata \"" + key + "\", which its"
                                + " type does not declare. Check the spelling, or add it to"
                                + " metadata-keys in markers.yml.",
                        marker.point()));
            }
        }

        checkOffset(marker, problems);
    }

    /** An offset that is not three numbers silently becomes a default, so it is worth naming. */
    private void checkOffset(PlacedMarker marker, List<MarkerProblem> problems) {
        Optional<String> raw = marker.get(PlacedMarker.OFFSET);

        if (raw.isEmpty()) {
            return;
        }

        String[] parts = raw.get().split(",");

        if (parts.length != 3) {
            problems.add(MarkerProblem.warning("invalid-offset",
                    "Marker \"" + marker.typeId() + "\" has offset \"" + raw.get()
                            + "\", which is not three numbers. Expected something like 0,1,0.",
                    marker.point()));
            return;
        }

        for (String part : parts) {
            try {
                Double.parseDouble(part.trim());
            } catch (NumberFormatException notANumber) {
                problems.add(MarkerProblem.warning("invalid-offset",
                        "Marker \"" + marker.typeId() + "\" has offset \"" + raw.get()
                                + "\", and \"" + part.trim() + "\" is not a number.",
                        marker.point()));
                return;
            }
        }
    }

    // ─── Structural checks ────────────────────────────────────────────────────────────────────

    /**
     * Exactly one origin and exactly one end.
     *
     * Checked by {@link MarkerType.Bounds} rather than by id, so a server that renames or replaces
     * the corner markers keeps working validation. Both problems are fatal: without two corners there
     * is no region, and without a region there is no protection, no upgrade area and no way to tell
     * whether anything else is inside the building.
     */
    private void checkCorners(List<PlacedMarker> markers, List<MarkerProblem> problems) {
        for (MarkerType.Bounds corner : List.of(MarkerType.Bounds.ORIGIN, MarkerType.Bounds.END)) {
            List<PlacedMarker> found = withBounds(markers, corner);
            String name = corner == MarkerType.Bounds.ORIGIN ? "origin" : "end";

            if (found.isEmpty()) {
                problems.add(MarkerProblem.fatal("missing-" + name,
                        "This structure has no " + name + " marker, so its area cannot be worked"
                                + " out. Place one at the " + name + " corner of the building."));
                continue;
            }

            if (found.size() > 1) {
                for (PlacedMarker duplicate : found) {
                    problems.add(MarkerProblem.fatal("duplicate-" + name,
                            "There is more than one " + name + " marker in this structure ("
                                    + found.size() + "). Exactly one is required.",
                            duplicate.point()));
                }
            }
        }
    }

    /**
     * Counts against each type's cardinality and its required flag.
     *
     * This is where "missing recruiter", "missing seller", "missing upgrade NPC" and "duplicate NPC
     * marker" are all decided, from configuration rather than from a list in this file.
     */
    private void checkCounts(List<PlacedMarker> markers, List<MarkerProblem> problems) {
        Map<String, List<PlacedMarker>> byType = new LinkedHashMap<>();

        for (PlacedMarker marker : markers) {
            byType.computeIfAbsent(marker.typeId(), key -> new ArrayList<>()).add(marker);
        }

        for (MarkerType type : registry.all()) {
            List<PlacedMarker> found = byType.getOrDefault(type.id(), List.of());

            if (found.isEmpty() && (type.required() || type.cardinality().mandatory())) {
                // Corner markers report their own absence in checkCorners, with a message about the
                // region rather than about the marker. Reporting it twice would be noise.
                if (!type.bounds().corner()) {
                    problems.add(MarkerProblem.fatal("missing-marker",
                            "This structure is missing its \"" + type.id() + "\" marker, which is"
                                    + " required. Place one and save the schematic again."));
                }
                continue;
            }

            if (found.size() > 1 && type.cardinality().singular() && !type.bounds().corner()) {
                for (PlacedMarker duplicate : found) {
                    problems.add(MarkerProblem.fatal("duplicate-marker",
                            "There are " + found.size() + " \"" + type.id() + "\" markers in this"
                                    + " structure, and only one is allowed. Remove the extras —"
                                    + " nothing can decide which of them is the real one.",
                            duplicate.point()));
                }
            }
        }
    }

    /**
     * The region itself: that it exists, that it is a sane size, and that everything is inside it.
     *
     * The corner markers are exempt from the containment check because they define what containment
     * means — {@link StructureRegion#between} is inclusive of both, so they are in fact inside, but
     * checking them would be circular reasoning even when it passes.
     */
    private void checkRegion(
            List<PlacedMarker> markers,
            Optional<StructureRegion> region,
            long maxVolume,
            List<MarkerProblem> problems
    ) {
        if (region.isEmpty()) {
            // checkCorners has already said why, in terms a builder can act on.
            return;
        }

        StructureRegion box = region.get();

        if (maxVolume > 0 && box.volume() > maxVolume) {
            problems.add(MarkerProblem.fatal("region-too-large",
                    "The area between the origin and end markers is " + box.volume()
                            + " blocks, and the limit is " + maxVolume + ". That usually means one"
                            + " of the two corner markers was left behind in another building."));
        }

        for (PlacedMarker marker : markers) {
            Optional<MarkerType> type = registry.get(marker.typeId());

            if (type.isPresent() && type.get().bounds().corner()) {
                continue;
            }

            if (!box.contains(marker.point())) {
                problems.add(MarkerProblem.fatal("marker-outside",
                        "Marker \"" + marker.typeId() + "\" is outside the area the origin and end"
                                + " markers define. Either move it inside, or move the corner"
                                + " markers so the building is fully covered.",
                        marker.point()));
            }
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────────────────────

    /** Markers whose registered type marks the given corner. */
    public List<PlacedMarker> withBounds(List<PlacedMarker> markers, MarkerType.Bounds bounds) {
        List<PlacedMarker> found = new ArrayList<>();

        for (PlacedMarker marker : markers) {
            Optional<MarkerType> type = registry.get(marker.typeId());

            if (type.isPresent() && type.get().bounds() == bounds) {
                found.add(marker);
            }
        }

        return List.copyOf(found);
    }

    /**
     * Derives the region from whichever markers mark the corners.
     *
     * @return empty when either corner is missing or duplicated — the caller reports why through
     *         {@link #validate}, so this stays a pure derivation with no opinion about it
     */
    public Optional<StructureRegion> regionOf(List<PlacedMarker> markers) {
        List<PlacedMarker> origins = withBounds(markers, MarkerType.Bounds.ORIGIN);
        List<PlacedMarker> ends = withBounds(markers, MarkerType.Bounds.END);

        if (origins.size() != 1 || ends.size() != 1) {
            return Optional.empty();
        }

        return StructureRegion.between(origins.get(0).point(), ends.get(0).point());
    }
}
