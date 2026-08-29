package org.robtic.minecraft.progression.workspace;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.block.Sign;
import org.bukkit.block.sign.Side;
import org.robtic.minecraft.util.Ids;
import org.robtic.minecraft.progression.api.WorldPoint;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * The hidden block a BetterStructures schematic carries, telling this plugin what the building is.
 *
 * <h2>Robtic never generates structures</h2>
 *
 * BetterStructures places the building; this plugin reads a marker inside it and reacts. That
 * separation is the whole design: the buildings are somebody else's problem, they can be edited by
 * whoever makes them, and adding a new guild is a schematic plus a config entry.
 *
 * <h2>Why the metadata is on a sign</h2>
 *
 * A marker must survive being saved into a schematic and pasted back out, and must be editable by a
 * builder with no access to the plugin. A sign is the only vanilla block that does all of that: its
 * text round-trips through every schematic format, and any builder can write on one.
 *
 * The sign is placed where the NPC should stand and is destroyed once read, so it is never visible
 * to players — which is what "NPC never exists inside schematic" means in practice. The alternative,
 * putting an armour stand or a real villager in the schematic, would leave a visible artefact in
 * every ungenerated copy and would spawn duplicates on any re-paste.
 *
 * <h2>Format</h2>
 *
 * <pre>
 *   line 1   [robtic]        the tag identifying this as ours
 *   line 2   miner           the job offered, or a marker kind
 *   line 3   offset=0,1,0    optional, where the NPC stands relative to the sign
 *   line 4   yaw=180         optional, which way it faces
 * </pre>
 *
 * @param jobId  the job this marker offers, lowercase
 * @param anchor where the marker itself was found
 * @param spawn  where the NPC should stand — the anchor plus any configured offset
 * @param yaw    which way the NPC faces
 * @param extra  any other {@code key=value} pairs, for metadata this version does not know about yet
 */
public record StructureMarker(
        String jobId,
        WorldPoint anchor,
        WorldPoint spawn,
        float yaw,
        Map<String, String> extra
) {

    /** The first line that identifies a sign as one of ours. Case-insensitive. */
    public static final String TAG = "[robtic]";

    public StructureMarker {
        extra = Map.copyOf(extra);
    }

    /**
     * Reads a marker from a block, if it is one.
     *
     * Tolerant by design: an unreadable line is skipped rather than failing the marker, because a
     * builder mistyping the offset should still get a working NPC in the default position instead of
     * a structure that silently offers no job at all.
     *
     * @return empty when this block is not a marker sign
     */
    public static Optional<StructureMarker> read(Block block) {
        if (!(block.getState() instanceof Sign sign)) {
            return Optional.empty();
        }

        List<String> lines = new ArrayList<>();

        for (net.kyori.adventure.text.Component line : sign.getSide(Side.FRONT).lines()) {
            lines.add(net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer
                    .plainText().serialize(line).trim());
        }

        if (lines.isEmpty() || !lines.get(0).equalsIgnoreCase(TAG)) {
            return Optional.empty();
        }

        String jobId = lines.size() > 1 ? Ids.normalise(lines.get(1)) : "";

        if (jobId.isEmpty()) {
            return Optional.empty();
        }

        Map<String, String> values = new LinkedHashMap<>();

        for (int index = 2; index < lines.size(); index++) {
            String line = lines.get(index);
            int split = line.indexOf('=');

            if (split > 0) {
                values.put(line.substring(0, split).trim().toLowerCase(Locale.ROOT),
                        line.substring(split + 1).trim());
            }
        }

        Location location = block.getLocation();
        WorldPoint anchor = WorldPoint.ofBlock(location);

        double[] offset = parseOffset(values.get("offset"));
        float yaw = parseYaw(values.get("yaw"));

        WorldPoint spawn = new WorldPoint(
                anchor.world(),
                anchor.x() + offset[0],
                anchor.y() + offset[1],
                anchor.z() + offset[2],
                yaw, 0f);

        return Optional.of(new StructureMarker(jobId, anchor, spawn, yaw, values));
    }

    /** Whether a material could be a marker, for the cheap pre-check before reading block state. */
    public static boolean couldBeMarker(Material material) {
        return org.bukkit.Tag.SIGNS.isTagged(material) || org.bukkit.Tag.WALL_SIGNS.isTagged(material);
    }

    private static double[] parseOffset(String raw) {
        // Defaults to one block up: a sign on the floor of a structure marks the spot, and the NPC
        // should stand on that spot rather than inside it.
        double[] offset = {0.0d, 1.0d, 0.0d};

        if (raw == null) {
            return offset;
        }

        String[] parts = raw.split(",");

        for (int index = 0; index < Math.min(3, parts.length); index++) {
            try {
                offset[index] = Double.parseDouble(parts[index].trim());
            } catch (NumberFormatException ignored) {
                // Keep the default for this axis. A builder's typo costs a block of placement, not
                // the whole structure.
            }
        }

        return offset;
    }

    private static float parseYaw(String raw) {
        if (raw == null) {
            return 0f;
        }

        try {
            return Float.parseFloat(raw.trim());
        } catch (NumberFormatException notANumber) {
            return 0f;
        }
    }

    /** A metadata value the builder wrote that this version has no meaning for yet. */
    public Optional<String> get(String key) {
        return Optional.ofNullable(extra.get(key.toLowerCase(Locale.ROOT)));
    }

    /**
     * A stable identifier for the structure this marker belongs to.
     *
     * Derived from the anchor's block coordinates, because a structure is where it is — two markers
     * at the same place are the same marker, however many times the chunk is loaded. Used to tie
     * spawned NPCs to their structure so duplicates can be detected and removed.
     */
    public String structureId() {
        return anchor.world() + ":" + (long) anchor.x() + ":" + (long) anchor.y() + ":" + (long) anchor.z();
    }

    /**
     * The reverse of {@link #structureId()}: recovers where a structure is from its id.
     *
     * The id is derived from block coordinates and therefore carries them, which makes a recruiter
     * that outlived the server session it was spawned in recoverable rather than scrap. Without this,
     * a structure discovered and not claimed before a restart was lost for good — its marker sign is
     * destroyed the moment it is read, so nothing in the world could say what the NPC standing there
     * was offering, and the only honest response to a click was to delete it.
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
                    Long.parseLong(structureId.substring(x + 1, y)) + 0.5d,
                    Long.parseLong(structureId.substring(y + 1, z)),
                    Long.parseLong(structureId.substring(z + 1)) + 0.5d,
                    0f, 0f));
        } catch (NumberFormatException notAnId) {
            return Optional.empty();
        }
    }
}
