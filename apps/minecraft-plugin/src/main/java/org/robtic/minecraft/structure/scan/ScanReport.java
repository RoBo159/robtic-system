package org.robtic.minecraft.structure.scan;

import org.robtic.minecraft.structure.api.MarkerProblem;
import org.robtic.minecraft.structure.api.MarkerSet;
import org.robtic.minecraft.structure.api.PlacedMarker;
import org.robtic.minecraft.structure.api.StructureRegion;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * What one scan found, and what was wrong with it.
 *
 * <h2>Both halves are always present</h2>
 *
 * A report carries the raw markers even when it failed, because the builder asking "why did my
 * building not register" needs to see what <em>was</em> found in order to work out what is missing.
 * A report that collapsed to a boolean would make the common failure — one corner marker left out —
 * indistinguishable from the rare one, which is that nothing was found at all.
 *
 * @param markers  every marker read, including ones of unregistered types
 * @param region   the region the corner markers defined, when they could
 * @param problems everything the validator objected to, fatal and otherwise
 * @param set      the finished set, present only when nothing fatal was found
 */
public record ScanReport(
        List<PlacedMarker> markers,
        Optional<StructureRegion> region,
        List<MarkerProblem> problems,
        Optional<MarkerSet> set
) {

    public ScanReport {
        markers = List.copyOf(markers);
        problems = List.copyOf(problems);
    }

    /** A scan that found nothing at all — not a failure, just an ordinary chunk with no structure in it. */
    public static ScanReport empty() {
        return new ScanReport(List.of(), Optional.empty(), List.of(), Optional.empty());
    }

    /** Whether the structure can be registered. */
    public boolean ok() {
        return set.isPresent();
    }

    /** Whether the scan found any marker at all, however broken. */
    public boolean foundAnything() {
        return !markers.isEmpty();
    }

    public List<MarkerProblem> fatal() {
        return filter(true);
    }

    public List<MarkerProblem> warnings() {
        return filter(false);
    }

    private List<MarkerProblem> filter(boolean wantFatal) {
        List<MarkerProblem> found = new ArrayList<>();

        for (MarkerProblem problem : problems) {
            if (problem.isFatal() == wantFatal) {
                found.add(problem);
            }
        }

        return List.copyOf(found);
    }

    /** A one-line summary, for a console message that should not be twenty lines long. */
    public String summary() {
        return markers.size() + " marker(s), "
                + fatal().size() + " error(s), "
                + warnings().size() + " warning(s)"
                + region.map(box -> ", area " + box.describe()).orElse(", no area");
    }
}
