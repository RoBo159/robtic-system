package org.robtic.minecraft.structure;

import org.robtic.minecraft.progression.api.WorldPoint;
import org.robtic.minecraft.structure.api.MarkerCardinality;
import org.robtic.minecraft.structure.api.MarkerProblem;
import org.robtic.minecraft.structure.api.MarkerRegistry;
import org.robtic.minecraft.structure.api.MarkerSet;
import org.robtic.minecraft.structure.api.MarkerType;
import org.robtic.minecraft.structure.api.PlacedMarker;
import org.robtic.minecraft.structure.api.StructureRegion;
import org.robtic.minecraft.structure.validate.MarkerValidator;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Checks that every validation rule the marker system promises actually fires.
 *
 * Each of these is a rule a builder will hit, and every one of them fails silently if it is wrong:
 * a missing check means a broken building generates, looks completely normal, and does nothing when
 * a player walks up to it. That is the failure mode this whole class exists to prevent, and it is
 * not one the runtime will ever report.
 */
public final class ValidationCheck {

    private static int failures;

    private static final MarkerRegistry REGISTRY = new MarkerRegistry(quietLogger());
    private static final MarkerValidator VALIDATOR = new MarkerValidator(REGISTRY);

    public static void main(String[] args) {
        registerTypes();

        aValidStructurePasses();
        missingOrigin();
        missingEnd();
        duplicateOrigin();
        duplicateEnd();
        missingRequiredMarker();
        duplicateNpcMarker();
        markerOutsideStructure();
        regionTooLarge();
        unknownType();
        futureVersion();
        badMetadata();
        offsetsAndSpawn();
        setQueriesAndRoundTrip();

        if (failures > 0) {
            System.err.println("ValidationCheck: " + failures + " failure(s).");
            System.exit(1);
        }

        System.out.println("ValidationCheck: all checks passed.");
    }

    /** The same shape as the shipped markers.yml, built in code so the check does not depend on the file. */
    private static void registerTypes() {
        REGISTRY.register(type("structure_origin", MarkerCardinality.EXACTLY_ONE, true, 0, "",
                MarkerType.Bounds.ORIGIN));
        REGISTRY.register(type("structure_end", MarkerCardinality.EXACTLY_ONE, true, 0, "",
                MarkerType.Bounds.END));
        REGISTRY.register(type("job_recruiter", MarkerCardinality.AT_MOST_ONE, true, 0, "recruiter",
                MarkerType.Bounds.NONE));
        REGISTRY.register(type("npc_seller", MarkerCardinality.AT_MOST_ONE, true, 1, "seller",
                MarkerType.Bounds.NONE));
        REGISTRY.register(type("npc_upgrade", MarkerCardinality.AT_MOST_ONE, true, 1, "upgrade",
                MarkerType.Bounds.NONE));
        REGISTRY.register(type("npc_slot_3", MarkerCardinality.AT_MOST_ONE, false, 2, "slot_3",
                MarkerType.Bounds.NONE));
        REGISTRY.register(type("decoration", MarkerCardinality.ANY, false, 0, "",
                MarkerType.Bounds.NONE));
    }

    // ─── The happy path ───────────────────────────────────────────────────────────────────────

    private static void aValidStructurePasses() {
        List<PlacedMarker> markers = complete();

        Optional<StructureRegion> region = VALIDATOR.regionOf(markers);
        List<MarkerProblem> problems = VALIDATOR.validate(markers, region, 500_000L);

        check("a complete structure derives a region", region.isPresent());
        check("a complete structure has no errors", fatal(problems).isEmpty());
        check("a complete structure has no warnings", warnings(problems).isEmpty());
    }

    // ─── The rules the spec names ─────────────────────────────────────────────────────────────

    private static void missingOrigin() {
        List<PlacedMarker> markers = without(complete(), "structure_origin");

        check("missing origin is fatal", has(validate(markers), "missing-origin", true));
        check("missing origin means no region", VALIDATOR.regionOf(markers).isEmpty());
    }

    private static void missingEnd() {
        check("missing end is fatal",
                has(validate(without(complete(), "structure_end")), "missing-end", true));
    }

    private static void duplicateOrigin() {
        List<PlacedMarker> markers = complete();
        markers.add(marker("structure_origin", 3, 64, 3));

        check("duplicate origin is fatal", has(validate(markers), "duplicate-origin", true));
        check("duplicate origin means no region", VALIDATOR.regionOf(markers).isEmpty());
    }

    private static void duplicateEnd() {
        List<PlacedMarker> markers = complete();
        markers.add(marker("structure_end", 8, 70, 8));

        check("duplicate end is fatal", has(validate(markers), "duplicate-end", true));
    }

    private static void missingRequiredMarker() {
        check("missing recruiter is fatal",
                has(validate(without(complete(), "job_recruiter")), "missing-marker", true));
        check("missing seller is fatal",
                has(validate(without(complete(), "npc_seller")), "missing-marker", true));
        check("missing upgrade NPC is fatal",
                has(validate(without(complete(), "npc_upgrade")), "missing-marker", true));

        // An optional marker's absence must not be reported at all.
        check("a missing optional marker is silent", validate(complete()).isEmpty());
    }

    private static void duplicateNpcMarker() {
        List<PlacedMarker> markers = complete();
        markers.add(marker("npc_seller", 6, 64, 6));

        check("duplicate NPC marker is fatal", has(validate(markers), "duplicate-marker", true));

        // A type declared as ANY must never trip it, however many are placed.
        List<PlacedMarker> decorated = complete();
        decorated.add(marker("decoration", 2, 64, 2));
        decorated.add(marker("decoration", 3, 64, 3));
        decorated.add(marker("decoration", 4, 64, 4));

        check("repeated 'any' markers are fine", validate(decorated).isEmpty());
    }

    private static void markerOutsideStructure() {
        List<PlacedMarker> markers = complete();
        markers.add(marker("npc_slot_3", 500, 64, 500));

        check("a marker outside the region is fatal", has(validate(markers), "marker-outside", true));
    }

    private static void regionTooLarge() {
        List<PlacedMarker> markers = new ArrayList<>();

        markers.add(marker("structure_origin", 0, 0, 0));
        markers.add(marker("structure_end", 1000, 300, 1000));
        markers.add(marker("job_recruiter", 5, 5, 5));
        markers.add(marker("npc_seller", 6, 5, 6));
        markers.add(marker("npc_upgrade", 7, 5, 7));

        List<MarkerProblem> problems =
                VALIDATOR.validate(markers, VALIDATOR.regionOf(markers), 500_000L);

        check("an oversized region is fatal", has(problems, "region-too-large", true));

        List<MarkerProblem> unlimited =
                VALIDATOR.validate(markers, VALIDATOR.regionOf(markers), 0L);

        check("max-volume 0 disables the check", !has(unlimited, "region-too-large", true));
    }

    // ─── Forward and backward compatibility ───────────────────────────────────────────────────

    /**
     * An unknown marker type must warn, never reject.
     *
     * A schematic built against a newer plugin arriving on an older one is a normal event, and a
     * building that still has its corners and its recruiter works perfectly well without whatever
     * the unknown marker was going to add.
     */
    private static void unknownType() {
        List<PlacedMarker> markers = complete();
        markers.add(marker("mailbox_from_the_future", 5, 64, 5));

        List<MarkerProblem> problems = validate(markers);

        check("an unknown type warns", has(problems, "unknown-type", false));
        check("an unknown type is not fatal", fatal(problems).isEmpty());
    }

    private static void futureVersion() {
        List<PlacedMarker> markers = complete();

        markers.add(new PlacedMarker("id", "npc_slot_3", 99,
                new WorldPoint("world", 5.5d, 64d, 5.5d, 0f, 0f), Map.of()));

        List<MarkerProblem> problems = validate(markers);

        check("a newer format version warns", has(problems, "future-version", false));
        check("a newer format version is not fatal", fatal(problems).isEmpty());
    }

    private static void badMetadata() {
        List<PlacedMarker> markers = complete();

        markers.add(new PlacedMarker("id", "npc_slot_3", 1,
                new WorldPoint("world", 5.5d, 64d, 5.5d, 0f, 0f),
                Map.of("colour", "red")));

        check("undeclared metadata warns", has(validate(markers), "unknown-metadata", false));

        List<PlacedMarker> badOffset = complete();

        badOffset.add(new PlacedMarker("id", "decoration", 1,
                new WorldPoint("world", 5.5d, 64d, 5.5d, 0f, 0f),
                Map.of("offset", "0,up,0")));

        check("a non-numeric offset warns", has(validate(badOffset), "invalid-offset", false));

        List<PlacedMarker> shortOffset = complete();

        shortOffset.add(new PlacedMarker("id", "decoration", 1,
                new WorldPoint("world", 5.5d, 64d, 5.5d, 0f, 0f),
                Map.of("offset", "0,1")));

        check("a two-part offset warns", has(validate(shortOffset), "invalid-offset", false));

        // offset and yaw are understood by every type and must never be reported as undeclared.
        List<PlacedMarker> fine = complete();

        fine.add(new PlacedMarker("id", "decoration", 1,
                new WorldPoint("world", 5.5d, 64d, 5.5d, 0f, 0f),
                Map.of("offset", "0,1,0", "yaw", "180")));

        check("offset and yaw are always understood", validate(fine).isEmpty());
    }

    // ─── Placement arithmetic ─────────────────────────────────────────────────────────────────

    private static void offsetsAndSpawn() {
        PlacedMarker plain = marker("npc_seller", 10, 64, 20);

        check("the default offset is one block up", plain.spawn().y() == 65d);
        check("x is block-centred", plain.spawn().x() == 10.5d);

        PlacedMarker offset = new PlacedMarker("id", "npc_seller", 1,
                new WorldPoint("world", 10.5d, 64d, 20.5d, 0f, 0f),
                Map.of("offset", "2,0,-1"));

        check("an offset moves the spawn", offset.spawn().x() == 12.5d
                && offset.spawn().y() == 64d
                && offset.spawn().z() == 19.5d);

        PlacedMarker yawed = new PlacedMarker("id", "npc_seller", 1,
                new WorldPoint("world", 10.5d, 64d, 20.5d, 90f, 0f),
                Map.of("yaw", "180"));

        check("metadata yaw overrides the block's facing", yawed.yaw() == 180f);

        PlacedMarker rotated = new PlacedMarker("id", "npc_seller", 1,
                new WorldPoint("world", 10.5d, 64d, 20.5d, 90f, 0f), Map.of());

        check("without metadata the block's facing is used", rotated.yaw() == 90f);

        // A broken axis must cost that axis only, not the marker.
        PlacedMarker partly = new PlacedMarker("id", "npc_seller", 1,
                new WorldPoint("world", 10.5d, 64d, 20.5d, 0f, 0f),
                Map.of("offset", "3,oops,4"));

        check("a broken axis keeps its default", partly.spawn().x() == 13.5d
                && partly.spawn().y() == 65d
                && partly.spawn().z() == 24.5d);
    }

    private static void setQueriesAndRoundTrip() {
        List<PlacedMarker> markers = complete();
        MarkerSet set = MarkerSet.of(VALIDATOR.regionOf(markers).orElseThrow(), markers);

        check("the set finds a type", set.has("npc_seller"));
        check("the set counts a type", set.count("npc_seller") == 1);
        check("the set resolves a role", set.byRole(REGISTRY, "seller").isPresent());
        check("an unknown role resolves to nothing", set.byRole(REGISTRY, "nobody").isEmpty());

        // The level gate: slot 3 exists in the set but must not be active in a level 1 building.
        List<PlacedMarker> withSlot = complete();
        withSlot.add(marker("npc_slot_3", 5, 64, 5));

        MarkerSet levelled = MarkerSet.of(VALIDATOR.regionOf(withSlot).orElseThrow(), withSlot);

        check("level 1 excludes a level 2 slot", levelled.npcMarkers(REGISTRY, 1).stream()
                .noneMatch(marker -> marker.typeId().equals("npc_slot_3")));
        check("level 2 includes a level 2 slot", levelled.npcMarkers(REGISTRY, 2).stream()
                .anyMatch(marker -> marker.typeId().equals("npc_slot_3")));
        check("markers with no role are never NPCs", levelled.npcMarkers(REGISTRY, 3).stream()
                .noneMatch(marker -> marker.typeId().startsWith("structure_")));

        // The id must survive a round trip, or a re-scan registers the same building twice.
        MarkerSet restored = MarkerSet.fromJson(set.toJson()).orElseThrow();

        check("a stored set keeps its id", restored.structureId().equals(set.structureId()));
        check("a stored set keeps its region", restored.region().equals(set.region()));
        check("a stored set keeps every marker", restored.size() == set.size());
        check("a stored marker keeps its metadata", MarkerSet
                .fromJson(MarkerSet.of(set.region(), List.of(new PlacedMarker("id", "decoration", 1,
                        new WorldPoint("world", 1.5d, 64d, 1.5d, 0f, 0f),
                        Map.of("offset", "0,2,0")))).toJson())
                .orElseThrow().markers().get(0).spawn().y() == 66d);

        check("the id is derived from the lower corner",
                set.structureId().equals(MarkerSet.idOf(set.region())));
    }

    // ─── Fixtures ─────────────────────────────────────────────────────────────────────────────

    /** A structure with everything a level 1 building needs and nothing wrong with it. */
    private static List<PlacedMarker> complete() {
        List<PlacedMarker> markers = new ArrayList<>();

        markers.add(marker("structure_origin", 0, 60, 0));
        markers.add(marker("structure_end", 15, 75, 15));
        markers.add(marker("job_recruiter", 7, 61, 7));
        markers.add(marker("npc_seller", 8, 61, 7));
        markers.add(marker("npc_upgrade", 9, 61, 7));

        return markers;
    }

    private static List<PlacedMarker> without(List<PlacedMarker> markers, String typeId) {
        List<PlacedMarker> kept = new ArrayList<>(markers);
        kept.removeIf(marker -> marker.typeId().equals(typeId));
        return kept;
    }

    private static PlacedMarker marker(String typeId, int x, int y, int z) {
        return new PlacedMarker(typeId + "-" + x + "-" + z, typeId, 1,
                new WorldPoint("world", x + 0.5d, y, z + 0.5d, 0f, 0f), Map.of());
    }

    private static MarkerType type(
            String id,
            MarkerCardinality cardinality,
            boolean required,
            int level,
            String role,
            MarkerType.Bounds bounds
    ) {
        return new MarkerType(id, "test", id, List.of(), "PAPER", 0,
                cardinality, required, level, role, bounds, java.util.Set.of(), Map.of());
    }

    private static List<MarkerProblem> validate(List<PlacedMarker> markers) {
        return VALIDATOR.validate(markers, VALIDATOR.regionOf(markers), 500_000L);
    }

    // ─── Assertions ───────────────────────────────────────────────────────────────────────────

    private static boolean has(List<MarkerProblem> problems, String code, boolean expectFatal) {
        return problems.stream()
                .anyMatch(problem -> problem.code().equals(code) && problem.isFatal() == expectFatal);
    }

    private static List<MarkerProblem> fatal(List<MarkerProblem> problems) {
        return problems.stream().filter(MarkerProblem::isFatal).toList();
    }

    private static List<MarkerProblem> warnings(List<MarkerProblem> problems) {
        return problems.stream().filter(problem -> !problem.isFatal()).toList();
    }

    private static void check(String what, boolean passed) {
        if (!passed) {
            failures++;
            System.err.println("  FAIL  " + what);
        }
    }

    /** Registration warnings are expected here; they are not what is being tested. */
    private static Logger quietLogger() {
        Logger logger = Logger.getLogger("marker-check");
        logger.setLevel(Level.OFF);
        return logger;
    }
}
