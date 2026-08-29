package org.robtic.minecraft.structure.api;

import com.google.gson.JsonObject;
import org.robtic.minecraft.progression.api.WorldPoint;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * One marker as it was found in the world: a type, a position, and whatever metadata was written on
 * it.
 *
 * <h2>It knows nothing about what it is for</h2>
 *
 * Deliberately. A placed marker does not know which NPC will stand on it, which building level
 * unlocks it, or whether it is required — all of that is on {@link MarkerType}, in configuration,
 * and is looked up by {@link #typeId()} when it is needed. That separation is what lets a server
 * change what a marker <em>means</em> without touching a single structure that already contains one.
 *
 * <h2>Why the id is per placement and not per type</h2>
 *
 * {@link #markerId()} is unique to this individual block, generated when the item was created. Two
 * "NPC slot 3" markers in two different buildings share a type id and have different marker ids,
 * which is what makes a specific marker referenceable in a log line, in a validation error, and in a
 * stored record that has to survive the block itself being cleared away.
 *
 * @param markerId a UUID string identifying this placement, stable across the schematic round trip
 * @param typeId   which {@link MarkerType} this is
 * @param version  the marker format version the item was written with; see
 *                 {@code MarkerItemFactory#VERSION}
 * @param point    block-centred position, carrying the facing the builder set
 * @param metadata free-form values, lowercase keys; see {@link MarkerType#metadataKeys()}
 */
public record PlacedMarker(
        String markerId,
        String typeId,
        int version,
        WorldPoint point,
        Map<String, String> metadata
) {

    /** Metadata key holding an {@code x,y,z} offset from the marker block to the spawn position. */
    public static final String OFFSET = "offset";

    /** Metadata key holding the facing, in degrees, for whatever is placed here. */
    public static final String YAW = "yaw";

    public PlacedMarker {
        metadata = Map.copyOf(metadata);
    }

    /** A metadata value, if the builder wrote one. */
    public Optional<String> get(String key) {
        return key == null
                ? Optional.empty()
                : Optional.ofNullable(metadata.get(key.toLowerCase(Locale.ROOT)));
    }

    public int blockX() {
        return (int) Math.floor(point.x());
    }

    public int blockY() {
        return (int) Math.floor(point.y());
    }

    public int blockZ() {
        return (int) Math.floor(point.z());
    }

    /**
     * Where a thing placed at this marker actually goes.
     *
     * The marker block sits where the builder put it; the offset moves what appears there. The
     * default is one block up, because a marker on the floor marks a spot an NPC should stand
     * <em>on</em> rather than inside.
     *
     * A malformed offset costs one axis of placement, not the marker: a builder's typo should still
     * produce a working structure.
     */
    public WorldPoint spawn() {
        double[] offset = {0.0d, 1.0d, 0.0d};

        String raw = metadata.get(OFFSET);

        if (raw != null) {
            String[] parts = raw.split(",");

            for (int index = 0; index < Math.min(3, parts.length); index++) {
                try {
                    offset[index] = Double.parseDouble(parts[index].trim());
                } catch (NumberFormatException ignored) {
                    // Keep the default for this axis.
                }
            }
        }

        return new WorldPoint(
                point.world(),
                point.x() + offset[0],
                point.y() + offset[1],
                point.z() + offset[2],
                yaw(), 0f);
    }

    /** The facing written on the marker, or the one baked into its position. */
    public float yaw() {
        String raw = metadata.get(YAW);

        if (raw == null) {
            return point.yaw();
        }

        try {
            return Float.parseFloat(raw.trim());
        } catch (NumberFormatException notANumber) {
            return point.yaw();
        }
    }

    public String describe() {
        return typeId + " at " + point.describe();
    }

    public JsonObject toJson() {
        JsonObject json = new JsonObject();

        json.addProperty("markerId", markerId);
        json.addProperty("typeId", typeId);
        json.addProperty("version", version);
        json.add("point", point.toJson());

        JsonObject meta = new JsonObject();
        metadata.forEach(meta::addProperty);
        json.add("metadata", meta);

        return json;
    }

    /** @return empty when a stored marker is missing a field, so one bad record is skipped */
    public static Optional<PlacedMarker> fromJson(JsonObject json) {
        if (json == null || !json.has("typeId") || !json.has("point")) {
            return Optional.empty();
        }

        Optional<WorldPoint> point = WorldPoint.fromJson(json.getAsJsonObject("point"));

        if (point.isEmpty()) {
            return Optional.empty();
        }

        Map<String, String> metadata = new LinkedHashMap<>();

        if (json.has("metadata") && json.get("metadata").isJsonObject()) {
            JsonObject meta = json.getAsJsonObject("metadata");

            for (String key : meta.keySet()) {
                metadata.put(key.toLowerCase(Locale.ROOT), meta.get(key).getAsString());
            }
        }

        return Optional.of(new PlacedMarker(
                json.has("markerId") ? json.get("markerId").getAsString() : "",
                json.get("typeId").getAsString(),
                json.has("version") ? json.get("version").getAsInt() : 1,
                point.get(),
                metadata));
    }
}
