package org.robtic.minecraft.structure;

import org.robtic.minecraft.progression.api.WorldPoint;
import org.robtic.minecraft.structure.api.StructureRegion;

import java.util.Optional;

/**
 * Checks the region arithmetic every protection and containment decision rests on.
 *
 * The requirement is that a builder places two corner markers in any order and gets the same box.
 * That is one line of code and four ways to get it wrong, and every one of them presents as
 * "protection works in some buildings and not others" — which is close to undiagnosable from a bug
 * report.
 */
public final class RegionCheck {

    private static int failures;

    public static void main(String[] args) {
        cornersInAnyOrder();
        inclusiveOfItsOwnCorners();
        containment();
        overlap();
        volumeAndPadding();
        crossWorldIsRefused();

        if (failures > 0) {
            System.err.println("RegionCheck: " + failures + " failure(s).");
            System.exit(1);
        }

        System.out.println("RegionCheck: all checks passed.");
    }

    /** The headline promise: origin and end are interchangeable. */
    private static void cornersInAnyOrder() {
        StructureRegion forward = between(10, 64, -20, 30, 80, -5);
        StructureRegion backward = between(30, 80, -5, 10, 64, -20);

        check("swapped corners give the same region", forward.equals(backward));

        check("min is the lower corner", forward.minX() == 10 && forward.minY() == 64 && forward.minZ() == -20);
        check("max is the upper corner", forward.maxX() == 30 && forward.maxY() == 80 && forward.maxZ() == -5);

        // Mixed: low X with high Z, the case a builder produces by walking round the building.
        StructureRegion mixed = between(30, 64, -20, 10, 80, -5);
        check("mixed axes normalise too", mixed.equals(forward));
    }

    /**
     * A corner marker must be inside its own region.
     *
     * If it were not, the validator's "marker outside the structure" rule would reject every
     * structure ever built, including a correct one.
     */
    private static void inclusiveOfItsOwnCorners() {
        StructureRegion region = between(0, 0, 0, 4, 4, 4);

        check("origin corner is inside", region.contains(0, 0, 0));
        check("end corner is inside", region.contains(4, 4, 4));
        check("one past the end is outside", !region.contains(5, 4, 4));
        check("one before the origin is outside", !region.contains(-1, 0, 0));
    }

    private static void containment() {
        StructureRegion region = between(-10, 60, -10, 10, 70, 10);

        check("centre is inside", region.contains(0, 65, 0));
        check("above the ceiling is outside", !region.contains(0, 71, 0));
        check("below the floor is outside", !region.contains(0, 59, 0));

        WorldPoint inside = new WorldPoint("world", 5.5d, 65d, -3.5d, 0f, 0f);
        WorldPoint outsideWorld = new WorldPoint("nether", 0d, 65d, 0d, 0f, 0f);

        check("a point inside is contained", region.contains(inside));
        check("the same point in another world is not", !region.contains(outsideWorld));
    }

    private static void overlap() {
        StructureRegion a = between(0, 60, 0, 10, 70, 10);

        check("touching regions overlap", a.overlaps(between(10, 60, 10, 20, 70, 20)));
        check("separated regions do not", !a.overlaps(between(11, 60, 11, 20, 70, 20)));
        check("stacked but not intersecting does not", !a.overlaps(between(0, 71, 0, 10, 80, 10)));

        StructureRegion elsewhere = new StructureRegion("nether", 0, 60, 0, 10, 70, 10);
        check("another world never overlaps", !a.overlaps(elsewhere));
    }

    private static void volumeAndPadding() {
        StructureRegion region = between(0, 0, 0, 9, 4, 9);

        check("volume counts both corners", region.volume() == 10L * 5L * 10L);
        check("width counts both corners", region.width() == 10);

        StructureRegion padded = region.padded(2, 1);

        check("padding grows horizontally", padded.minX() == -2 && padded.maxX() == 11);
        check("padding grows vertically by its own amount", padded.minY() == -1 && padded.maxY() == 5);
        check("negative padding is ignored", region.padded(-5, -5).equals(region));

        // 5000 × 400 × 5000 is ten billion, which wraps to a negative number if the multiplication
        // is done in int arithmetic and only cast afterwards. That is the exact mistake the cast in
        // volume() exists to prevent, and a negative volume would sail straight past the
        // max-volume check that refuses an absurdly large claim.
        StructureRegion huge = between(0, 0, 0, 4999, 399, 4999);

        check("volume does not overflow", huge.volume() == 10_000_000_000L);
    }

    private static void crossWorldIsRefused() {
        Optional<StructureRegion> region = StructureRegion.between(
                new WorldPoint("world", 0d, 0d, 0d, 0f, 0f),
                new WorldPoint("world_nether", 10d, 10d, 10d, 0f, 0f));

        check("corners in different worlds produce no region", region.isEmpty());
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────────────────────

    private static StructureRegion between(int ax, int ay, int az, int bx, int by, int bz) {
        return StructureRegion.between(
                new WorldPoint("world", ax, ay, az, 0f, 0f),
                new WorldPoint("world", bx, by, bz, 0f, 0f)).orElseThrow();
    }

    private static void check(String what, boolean passed) {
        if (!passed) {
            failures++;
            System.err.println("  FAIL  " + what);
        }
    }
}
