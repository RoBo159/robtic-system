package org.robtic.jobs.workspace;

import org.robtic.core.geometry.WorldPoint;
import org.robtic.core.util.Ids;
import org.robtic.world.api.MarkerSet;
import org.robtic.world.api.PlacedMarker;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * What this plugin needs out of one recruiter marker, once RobticWorld has read the structure.
 *
 * <h2>This used to be a marker system of its own, and that was the bug</h2>
 *
 * The original version read a sign's <em>text</em> — line 1 {@code [robtic]}, line 2 the job id —
 * scanned every newly generated chunk itself to find them, and treated whatever it found as
 * authoritative. Three things were wrong with that, and they were all the same thing:
 *
 * <ul>
 *   <li><b>Anyone could forge one.</b> Identity was four lines of text. A player with a sign and a
 *       dye could write {@code [robtic]} / {@code miner} and manufacture a guild hall.</li>
 *   <li><b>It duplicated RobticWorld.</b> Every newly generated chunk was snapshotted and swept
 *       twice — once by that module's marker discovery and once here — for two marker formats that
 *       described the same thing.</li>
 *   <li><b>It had no structure.</b> A lone sign was a whole building. There was no origin, no end, no
 *       region, no validation and no way to say "and the seller stands here", so a workspace's area
 *       came from a radius in a config file rather than from what the builder actually built.</li>
 * </ul>
 *
 * RobticWorld already owns a marker system that solves all three — identity in a persistent data
 * container this plugin alone can write, one scan, and a validated {@link MarkerSet} with a real
 * region. So this record is no longer a parser. It is the small view of that set which the profession
 * system cares about, built by {@link #fromRecruiter}.
 *
 * @param jobId       the profession offered, from the recruiter marker's {@code job} metadata
 * @param structureId RobticWorld's id for the building, stable across rescans and restarts
 * @param anchor      where the recruiter marker itself was
 * @param spawn       where the recruiter stands — the marker's own offset already applied
 * @param yaw         which way it faces
 * @param extra       the rest of the marker's metadata, for whatever reads it next
 */
public record StructureMarker(
        String jobId,
        String structureId,
        WorldPoint anchor,
        WorldPoint spawn,
        float yaw,
        Map<String, String> extra
) {

    /** Metadata key on a recruiter marker naming the profession it offers. */
    public static final String JOB = "job";

    public StructureMarker {
        extra = Map.copyOf(extra);
    }

    /**
     * Builds the recruiter view of a scanned structure.
     *
     * <h2>Where the job id comes from, and why it may be absent</h2>
     *
     * From the marker's {@code job} metadata, which {@code markers.yml} declares on the
     * {@code job_recruiter} type. A builder who places a recruiter and does not say which profession
     * it offers has built something this plugin cannot act on — so it reports empty and the caller
     * logs it, rather than guessing at a profession and staffing the wrong guild.
     *
     * @param marker the marker RobticWorld matched to the recruiter role
     * @param set    the structure it belongs to, for the id and the region
     */
    public static Optional<StructureMarker> fromRecruiter(PlacedMarker marker, MarkerSet set) {
        String jobId = marker.get(JOB).map(Ids::normalise).orElse("");

        if (jobId.isEmpty()) {
            return Optional.empty();
        }

        return Optional.of(new StructureMarker(
                jobId,
                set.structureId(),
                marker.point(),
                marker.spawn(),
                marker.yaw(),
                marker.metadata()));
    }

    /** A metadata value the builder wrote that this version has no meaning for yet. */
    public Optional<String> get(String key) {
        return Optional.ofNullable(extra.get(key.toLowerCase(Locale.ROOT)));
    }

    /**
     * Recovers where a structure is from its id.
     *
     * RobticWorld builds a structure id out of its region's lower corner, so the id carries block
     * coordinates and a recruiter that outlived the session it was spawned in is recoverable rather
     * than scrap. Without this, a structure discovered and not claimed before a restart was lost for
     * good — the marker blocks are cleared the moment they are read, so nothing in the world could
     * say what the NPC standing there was offering, and the only honest response to a click was to
     * delete it.
     *
     * Split from the right, so a world name containing a colon still resolves.
     *
     * @return empty when the id is not one of ours or names a world that is not loaded
     */
    public static Optional<WorldPoint> anchorOf(String structureId) {
        if (structureId == null) {
            return Optional.empty();
        }

        int z = structureId.lastIndexOf(':');
        int y = z <= 0 ? -1 : structureId.lastIndexOf(':', z - 1);
        int x = y <= 0 ? -1 : structureId.lastIndexOf(':', y - 1);

        if (x <= 0) {
            return Optional.empty();
        }

        try {
            return Optional.of(new WorldPoint(
                    structureId.substring(0, x),
                    Double.parseDouble(structureId.substring(x + 1, y)),
                    Double.parseDouble(structureId.substring(y + 1, z)),
                    Double.parseDouble(structureId.substring(z + 1)),
                    0f, 0f));
        } catch (NumberFormatException notOurs) {
            return Optional.empty();
        }
    }
}
