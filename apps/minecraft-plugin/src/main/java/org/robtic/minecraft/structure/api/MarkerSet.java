package org.robtic.minecraft.structure.api;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.robtic.minecraft.util.Ids;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Every marker found in one structure, plus the region they describe.
 *
 * <h2>This is what outlives the blocks</h2>
 *
 * Marker blocks are cleared from the world once they have been read — that is what makes them
 * invisible during play. Everything the plugin will ever need from them is in this object, and this
 * object is persisted with the structure. A level 2 upgrade three weeks later reads the NPC
 * positions from here, not from the world, which is why upgrading does not require the markers to
 * still be standing.
 *
 * <h2>Immutable, and queried rather than iterated</h2>
 *
 * A caller wanting the seller's position asks for it by role or by type; nobody outside this class
 * loops over the raw list looking for a string. That keeps the "which marker means what" decision in
 * one place and makes the type index worth building once at construction rather than per lookup.
 *
 * @param structureId stable id derived from the region's lower corner — a structure is where it is
 * @param region      the cuboid the corner markers defined
 * @param markers     every marker read, in the order the scan found them
 */
public record MarkerSet(String structureId, StructureRegion region, List<PlacedMarker> markers) {

    public MarkerSet {
        markers = List.copyOf(markers);
    }

    /**
     * Builds a set and derives its id from the region.
     *
     * The id comes from the lower corner rather than from a random UUID so that re-scanning the same
     * generated building produces the same id. Without that, a server restart mid-discovery would
     * register the same structure twice under two ids and spawn two recruiters in one doorway.
     */
    public static MarkerSet of(StructureRegion region, List<PlacedMarker> markers) {
        return new MarkerSet(idOf(region), region, markers);
    }

    public static String idOf(StructureRegion region) {
        return region.world() + ":" + region.minX() + ":" + region.minY() + ":" + region.minZ();
    }

    // ─── Queries ──────────────────────────────────────────────────────────────────────────────

    /** Every marker of one type, in scan order. */
    public List<PlacedMarker> ofType(String typeId) {
        String id = Ids.normalise(typeId);
        List<PlacedMarker> found = new ArrayList<>();

        for (PlacedMarker marker : markers) {
            if (marker.typeId().equals(id)) {
                found.add(marker);
            }
        }

        return List.copyOf(found);
    }

    /** The single marker of a type, when there is exactly one to speak of. */
    public Optional<PlacedMarker> first(String typeId) {
        String id = Ids.normalise(typeId);

        for (PlacedMarker marker : markers) {
            if (marker.typeId().equals(id)) {
                return Optional.of(marker);
            }
        }

        return Optional.empty();
    }

    public int count(String typeId) {
        return ofType(typeId).size();
    }

    public boolean has(String typeId) {
        return first(typeId).isPresent();
    }

    /** How many of each type were found, for validation and for a summary line. */
    public Map<String, Integer> countsByType() {
        Map<String, Integer> counts = new LinkedHashMap<>();

        for (PlacedMarker marker : markers) {
            counts.merge(marker.typeId(), 1, Integer::sum);
        }

        return Map.copyOf(counts);
    }

    /**
     * Markers whose type spawns an NPC and is unlocked at a given building level.
     *
     * The level gate lives here rather than in the workspace so that every consumer of markers —
     * workspaces, dungeons, guild halls — gets the same "slot 3 appears at level 2" behaviour from
     * the same code, driven by the same configuration.
     *
     * @param registry needed because a placed marker deliberately knows nothing about its own type
     */
    public List<PlacedMarker> npcMarkers(MarkerRegistry registry, int buildingLevel) {
        List<PlacedMarker> found = new ArrayList<>();

        for (PlacedMarker marker : markers) {
            Optional<MarkerType> type = registry.get(marker.typeId());

            if (type.isPresent() && type.get().spawnsNpc() && type.get().activeAt(buildingLevel)) {
                found.add(marker);
            }
        }

        return List.copyOf(found);
    }

    /**
     * The marker for one configured NPC role, if the builder placed one.
     *
     * The role is the join between a marker and an NPC definition, and it is the only join: the
     * marker never names a Citizens NPC, and the NPC definition never names a position.
     */
    public Optional<PlacedMarker> byRole(MarkerRegistry registry, String role) {
        String wanted = Ids.normalise(role);

        for (PlacedMarker marker : markers) {
            Optional<MarkerType> type = registry.get(marker.typeId());

            if (type.isPresent() && Ids.normalise(type.get().npcRole()).equals(wanted)) {
                return Optional.of(marker);
            }
        }

        return Optional.empty();
    }

    /** Markers this build of the plugin has no definition for, so a scan can report them. */
    public List<PlacedMarker> unknown(MarkerRegistry registry) {
        List<PlacedMarker> found = new ArrayList<>();

        for (PlacedMarker marker : markers) {
            if (registry.get(marker.typeId()).isEmpty()) {
                found.add(marker);
            }
        }

        return List.copyOf(found);
    }

    public int size() {
        return markers.size();
    }

    // ─── Persistence ──────────────────────────────────────────────────────────────────────────

    public JsonObject toJson() {
        JsonObject json = new JsonObject();

        json.addProperty("structureId", structureId);
        json.add("region", region.toJson());

        JsonArray array = new JsonArray();
        markers.forEach(marker -> array.add(marker.toJson()));
        json.add("markers", array);

        return json;
    }

    /**
     * Reads a stored set.
     *
     * A marker that fails to parse is dropped and the rest of the set survives, because the
     * alternative — discarding the structure — would unclaim somebody's workspace over one corrupt
     * field.
     *
     * @return empty only when the region is unreadable, which is the one part nothing can work
     *         without
     */
    public static Optional<MarkerSet> fromJson(JsonObject json) {
        if (json == null || !json.has("region")) {
            return Optional.empty();
        }

        Optional<StructureRegion> region = StructureRegion.fromJson(json.getAsJsonObject("region"));

        if (region.isEmpty()) {
            return Optional.empty();
        }

        List<PlacedMarker> markers = new ArrayList<>();

        if (json.has("markers") && json.get("markers").isJsonArray()) {
            for (JsonElement element : json.getAsJsonArray("markers")) {
                if (element.isJsonObject()) {
                    PlacedMarker.fromJson(element.getAsJsonObject()).ifPresent(markers::add);
                }
            }
        }

        String id = json.has("structureId")
                ? json.get("structureId").getAsString()
                : idOf(region.get());

        return Optional.of(new MarkerSet(id, region.get(), markers));
    }
}
