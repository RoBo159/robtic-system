package org.robtic.minecraft.progression.workspace;

import com.google.gson.JsonObject;
import org.bukkit.Location;
import org.robtic.minecraft.progression.api.Identified;
import org.robtic.minecraft.progression.api.WorldPoint;
import org.robtic.minecraft.progression.npc.NpcHandle;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * A player's business: the building they claimed, and everything that has accrued to it since.
 *
 * <h2>Not a building</h2>
 *
 * The distinction matters for the design rather than the prose. If a workspace were a building, its
 * identity would be its position and its state would be its blocks — and every future system
 * (contracts, reputation, collections, events) would have to find its data by looking at the world.
 * Instead the world holds an approximation of a workspace and this record holds the truth, so a
 * workspace remains recoverable when its chunk is unloaded, its NPC despawned or its region never
 * loaded at all.
 *
 * <h2>Adding fields later must not break existing saves</h2>
 *
 * Two mechanisms, and both are load-bearing given how many systems are queued to build on this:
 *
 * <ul>
 *   <li>Every field is decoded with a fallback, so a record written by an older version loads with
 *       sensible values rather than failing.</li>
 *   <li>{@link #extras} carries anything this version does not have a field for, and is written back
 *       out untouched. A record round-tripped through an older plugin therefore keeps the newer
 *       plugin's data instead of silently dropping it — which is what makes a downgrade survivable.</li>
 * </ul>
 *
 * <h2>Immutable</h2>
 *
 * Every change returns a new instance, and {@code WorkspaceService} is what decides whether the
 * change is persisted. That is what makes an upgrade atomic: the new state is built in full, and
 * either committed or discarded — there is no half-updated workspace to repair.
 *
 * @param id              generated, stable for the life of the claim
 * @param owner           the one player who owns it
 * @param professionId    the job it serves
 * @param structureId     the discovered structure it was claimed from, so a re-scan knows it is taken
 * @param anchor          the marker position, and the origin of {@link #region}
 * @param region          the protected volume
 * @param level           upgrade tier, 1-based
 * @param storage         virtual storage; never reset by an upgrade
 * @param npcs            role → NPC. Generic, so future roles need no new field
 * @param createdAt       epoch millis
 * @param lastAccessAt    epoch millis the owner last interacted, for idle reporting
 * @param lastTaxPaidAt   epoch millis, 0 when never paid
 * @param lastUpgradeAt   epoch millis, 0 when never upgraded
 * @param taxSuspended    whether services are disabled for unpaid tax. Never deletes anything
 * @param extras          forward-compatibility bag; see above
 */
public record Workspace(
        String id,
        UUID owner,
        String professionId,
        String structureId,
        WorldPoint anchor,
        WorkspaceRegion region,
        int level,
        WorkspaceStorage storage,
        Map<String, NpcHandle> npcs,
        long createdAt,
        long lastAccessAt,
        long lastTaxPaidAt,
        long lastUpgradeAt,
        boolean taxSuspended,
        Map<String, String> extras
) implements Identified {

    public Workspace {
        level = Math.max(1, level);
        npcs = Map.copyOf(npcs);
        extras = Map.copyOf(extras);
    }

    /** A freshly claimed workspace at tier 1 with empty storage. */
    public static Workspace create(
            UUID owner,
            String professionId,
            String structureId,
            WorldPoint anchor,
            WorkspaceRegion region,
            long now
    ) {
        return new Workspace(
                UUID.randomUUID().toString(),
                owner,
                professionId,
                structureId,
                anchor,
                region,
                1,
                WorkspaceStorage.EMPTY,
                Map.of(),
                now,
                now,
                // Never paid, and never upgraded. Zero rather than `now` so the first tax interval is
                // measured from the claim by the tax service, which treats 0 as "since creation".
                0L,
                0L,
                false,
                Map.of());
    }

    public boolean ownedBy(UUID player) {
        return owner.equals(player);
    }

    public boolean covers(Location location) {
        return region.contains(location);
    }

    // ─── Mutations ────────────────────────────────────────────────────────────────────────────
    //
    // Each returns a new instance. Nothing here writes to storage; that is the service's decision,
    // which is what lets a multi-step operation be assembled and then committed or thrown away.

    public Workspace withStorage(WorkspaceStorage next) {
        return new Workspace(id, owner, professionId, structureId, anchor, region, level, next,
                npcs, createdAt, lastAccessAt, lastTaxPaidAt, lastUpgradeAt, taxSuspended, extras);
    }

    /**
     * Raises the tier.
     *
     * Storage is carried across untouched, deliberately and visibly: the brief is that a player must
     * never fear upgrading, and the way to guarantee that is for the upgrade path to have no
     * opportunity to touch their items at all.
     */
    public Workspace withLevel(int next, long now) {
        return new Workspace(id, owner, professionId, structureId, anchor, region, next, storage,
                npcs, createdAt, lastAccessAt, lastTaxPaidAt, now, taxSuspended, extras);
    }

    /** Records an NPC in a role, replacing whatever was there. */
    public Workspace withNpc(String role, NpcHandle handle) {
        Map<String, NpcHandle> next = new LinkedHashMap<>(npcs);
        next.put(role, handle);

        return new Workspace(id, owner, professionId, structureId, anchor, region, level, storage,
                next, createdAt, lastAccessAt, lastTaxPaidAt, lastUpgradeAt, taxSuspended, extras);
    }

    public Workspace withoutNpc(String role) {
        if (!npcs.containsKey(role)) {
            return this;
        }

        Map<String, NpcHandle> next = new LinkedHashMap<>(npcs);
        next.remove(role);

        return new Workspace(id, owner, professionId, structureId, anchor, region, level, storage,
                next, createdAt, lastAccessAt, lastTaxPaidAt, lastUpgradeAt, taxSuspended, extras);
    }

    public Optional<NpcHandle> npc(String role) {
        return Optional.ofNullable(npcs.get(role));
    }

    /**
     * Which role an NPC fills here, if it is one of this workspace's.
     *
     * The reverse of {@link #npc}, and the answer the interaction listener needs: it starts from a
     * clicked NPC and has to find out what that NPC is for. There are at most a handful of roles per
     * workspace, so a scan is the right shape — a second index would be state that can disagree with
     * the first.
     */
    public Optional<String> roleOf(NpcHandle handle) {
        if (handle == null) {
            return Optional.empty();
        }

        for (Map.Entry<String, NpcHandle> entry : npcs.entrySet()) {
            if (handle.equals(entry.getValue())) {
                return Optional.of(entry.getKey());
            }
        }

        return Optional.empty();
    }

    public Workspace touched(long now) {
        return new Workspace(id, owner, professionId, structureId, anchor, region, level, storage,
                npcs, createdAt, now, lastTaxPaidAt, lastUpgradeAt, taxSuspended, extras);
    }

    /**
     * Records that the bill has been settled.
     *
     * Deliberately does not clear {@link #taxSuspended}. It used to, and that was the reason paying
     * an overdue bill left the NPCs gone: the caller settles and then asks the service to lift the
     * suspension, and the service short-circuits when the flag already says what it is being asked to
     * set — so the flag being cleared here meant the re-staffing step never ran. Recording the
     * payment and lifting the suspension are two different facts, and only one of them belongs here.
     */
    public Workspace taxPaid(long now) {
        return new Workspace(id, owner, professionId, structureId, anchor, region, level, storage,
                npcs, createdAt, lastAccessAt, now, lastUpgradeAt, taxSuspended, extras);
    }

    /**
     * Suspends or restores the workspace's services.
     *
     * Suspension disables the NPCs and nothing else. It never removes ownership, storage, levels or
     * the region — the point is to make maintenance matter, not to delete months of a player's work
     * because they were away for a fortnight.
     */
    public Workspace taxSuspended(boolean suspended) {
        return new Workspace(id, owner, professionId, structureId, anchor, region, level, storage,
                npcs, createdAt, lastAccessAt, lastTaxPaidAt, lastUpgradeAt, suspended, extras);
    }

    /** Sets a forward-compatibility value. How a future system stores state without a schema change. */
    public Workspace withExtra(String key, String value) {
        Map<String, String> next = new LinkedHashMap<>(extras);

        if (value == null) {
            next.remove(key);
        } else {
            next.put(key, value);
        }

        return new Workspace(id, owner, professionId, structureId, anchor, region, level, storage,
                npcs, createdAt, lastAccessAt, lastTaxPaidAt, lastUpgradeAt, taxSuspended, next);
    }

    public Optional<String> extra(String key) {
        return Optional.ofNullable(extras.get(key));
    }

    // ─── Persistence ──────────────────────────────────────────────────────────────────────────

    public JsonObject toJson() {
        JsonObject json = new JsonObject();

        json.addProperty("id", id);
        json.addProperty("owner", owner.toString());
        json.addProperty("profession", professionId);
        json.addProperty("structure", structureId);
        json.add("anchor", anchor.toJson());
        json.add("region", region.toJson());
        json.addProperty("level", level);
        json.add("storage", storage.toJson());

        JsonObject npcJson = new JsonObject();
        npcs.forEach((role, handle) -> npcJson.addProperty(role, handle.serialise()));
        json.add("npcs", npcJson);

        json.addProperty("createdAt", createdAt);
        json.addProperty("lastAccessAt", lastAccessAt);
        json.addProperty("lastTaxPaidAt", lastTaxPaidAt);
        json.addProperty("lastUpgradeAt", lastUpgradeAt);
        json.addProperty("taxSuspended", taxSuspended);

        // Written back verbatim, so a field this version does not know about survives a round trip.
        JsonObject extraJson = new JsonObject();
        extras.forEach(extraJson::addProperty);
        json.add("extras", extraJson);

        return json;
    }

    /**
     * Reads a stored workspace.
     *
     * @return empty only when a field the workspace cannot function without is missing or unreadable
     *         — the id, the owner, or the region. Everything else falls back, so a record from an
     *         older version loads rather than being discarded
     */
    public static Optional<Workspace> fromJson(JsonObject json) {
        if (json == null) {
            return Optional.empty();
        }

        try {
            if (!json.has("id") || !json.has("owner")) {
                return Optional.empty();
            }

            Optional<WorldPoint> anchor = WorldPoint.fromJson(json.getAsJsonObject("anchor"));
            Optional<WorkspaceRegion> region = WorkspaceRegion.fromJson(json.getAsJsonObject("region"));

            if (anchor.isEmpty() || region.isEmpty()) {
                return Optional.empty();
            }

            Map<String, NpcHandle> npcs = new LinkedHashMap<>();

            if (json.has("npcs") && json.get("npcs").isJsonObject()) {
                JsonObject npcJson = json.getAsJsonObject("npcs");

                for (String role : npcJson.keySet()) {
                    // An unparseable handle is dropped rather than failing the workspace: the NPC is
                    // respawnable, the workspace is not.
                    NpcHandle.parse(npcJson.get(role).getAsString())
                            .ifPresent(handle -> npcs.put(role, handle));
                }
            }

            Map<String, String> extras = new LinkedHashMap<>();

            if (json.has("extras") && json.get("extras").isJsonObject()) {
                JsonObject extraJson = json.getAsJsonObject("extras");
                extraJson.keySet().forEach(key -> extras.put(key, extraJson.get(key).getAsString()));
            }

            long now = System.currentTimeMillis();

            return Optional.of(new Workspace(
                    json.get("id").getAsString(),
                    UUID.fromString(json.get("owner").getAsString()),
                    string(json, "profession", ""),
                    string(json, "structure", ""),
                    anchor.get(),
                    region.get(),
                    number(json, "level", 1L).intValue(),
                    json.has("storage") && json.get("storage").isJsonObject()
                            ? WorkspaceStorage.fromJson(json.getAsJsonObject("storage"))
                            : WorkspaceStorage.EMPTY,
                    npcs,
                    number(json, "createdAt", now),
                    number(json, "lastAccessAt", now),
                    number(json, "lastTaxPaidAt", 0L),
                    number(json, "lastUpgradeAt", 0L),
                    json.has("taxSuspended") && json.get("taxSuspended").getAsBoolean(),
                    extras));
        } catch (RuntimeException malformed) {
            return Optional.empty();
        }
    }

    private static String string(JsonObject json, String key, String fallback) {
        return json.has(key) && json.get(key).isJsonPrimitive() ? json.get(key).getAsString() : fallback;
    }

    private static Long number(JsonObject json, String key, long fallback) {
        try {
            return json.has(key) && json.get(key).isJsonPrimitive() ? json.get(key).getAsLong() : fallback;
        } catch (RuntimeException notANumber) {
            return fallback;
        }
    }
}
