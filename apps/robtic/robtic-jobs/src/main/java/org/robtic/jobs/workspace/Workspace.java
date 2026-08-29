package org.robtic.jobs.workspace;

import com.google.gson.JsonObject;
import org.bukkit.Location;
import org.robtic.core.registry.Identified;
import org.robtic.core.geometry.WorldPoint;
import org.robtic.jobs.npc.NpcHandle;

import org.robtic.jobs.workspace.worker.NpcWorker;
import org.robtic.jobs.workspace.worker.PlayerWorker;
import org.robtic.jobs.workspace.worker.Worker;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * A player's business: the building they claimed, and everything that has accrued to it since.
 *
 * <h2>Not a building</h2>
 *
 * The distinction matters for the design rather than the prose. If a business were a building, its
 * identity would be its position and its state would be its blocks — and every future system
 * (contracts, reputation, collections, events) would have to find its data by looking at the world.
 * Instead the world holds an approximation of a business and this record holds the truth, so it
 * remains recoverable when its chunk is unloaded, its NPC despawned or its region never loaded at
 * all. It is also what makes a base-level upgrade safe: the building is replaced wholesale and not
 * one field here is at risk.
 *
 * <h2>Two axes of progression</h2>
 *
 * {@link #level} is the headquarters — what the business <em>is</em>, and what it unlocks.
 * {@link #upgrades} is what it <em>has</em>, each climbing on its own. They are separate fields
 * because they are separate decisions; see {@link BaseLevel} and {@link WorkspaceUpgrade}.
 *
 * <h2>The licence snapshot, and why it lives here</h2>
 *
 * A workspace licence is an item in the owner's inventory, so the only way to read one is to have
 * the owner online. But the thing that has to be decided — is this business suspended, is it out of
 * grace, should it be abandoned — has to be decidable for an owner who has not logged in for a
 * month, which is precisely the case that matters.
 *
 * So {@link #licenseExpiresAt} records what was true the last time anybody could look. Zero means
 * nobody ever has, and is deliberately treated as "not expired" everywhere: failing open costs an
 * unlicensed business a few more days of trading, and failing closed destroys somebody's work
 * because the server could not read an inventory.
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
 * either committed or discarded — there is no half-updated business to repair.
 *
 * @param id               generated, stable for the life of the claim
 * @param owner            the one player who owns it
 * @param professionId     the job it serves
 * @param structureId      the discovered structure it was claimed from, so a re-scan knows it is taken
 * @param anchor           the marker position, and the origin of {@link #region}
 * @param region           the protected volume
 * @param level            base level, 1-based
 * @param upgrades         upgrade id → level bought. Absent means never bought, which is worth zero
 * @param workers          worker id → employee, of either kind. See {@link Worker}
 * @param storage          virtual storage; never reset by an upgrade
 * @param npcs             role → NPC. Generic, so future roles need no new field
 * @param createdAt        epoch millis
 * @param lastAccessAt     epoch millis the owner last interacted, for idle reporting
 * @param lastTaxPaidAt    epoch millis, 0 when never paid
 * @param lastUpgradeAt    epoch millis, 0 when never upgraded
 * @param licenseExpiresAt epoch millis the workspace licence lapses; 0 when never observed
 * @param licenseCheckedAt epoch millis the snapshot above was taken, for diagnostics
 * @param taxSuspended     whether services are disabled for unpaid tax. Never deletes anything
 * @param extras           forward-compatibility bag; see above
 */
public record Workspace(
        String id,
        UUID owner,
        String professionId,
        String structureId,
        WorldPoint anchor,
        WorkspaceRegion region,
        int level,
        Map<String, Integer> upgrades,
        Map<String, Worker> workers,
        WorkspaceStorage storage,
        Map<String, NpcHandle> npcs,
        long createdAt,
        long lastAccessAt,
        long lastTaxPaidAt,
        long lastUpgradeAt,
        long licenseExpiresAt,
        long licenseCheckedAt,
        boolean taxSuspended,
        Map<String, String> extras
) implements Identified {

    public Workspace {
        level = Math.max(1, level);
        upgrades = Map.copyOf(upgrades);
        workers = Map.copyOf(workers);
        npcs = Map.copyOf(npcs);
        extras = Map.copyOf(extras);
    }

    /** A freshly claimed business at base level 1, with nothing bought and empty storage. */
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
                Map.of(),
                Map.of(),
                WorkspaceStorage.EMPTY,
                Map.of(),
                now,
                now,
                // Never paid, and never upgraded. Zero rather than `now` so the first tax interval is
                // measured from the claim by the tax service, which treats 0 as "since creation".
                0L,
                0L,
                // No licence observed yet. The lifecycle service fills this in the first time the
                // owner is seen holding one; until then the business is treated as licensed.
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

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    /** What level an upgrade has been bought to. Zero for one never bought. */
    public int upgradeLevel(String upgradeId) {
        return upgrades.getOrDefault(upgradeId.toLowerCase(java.util.Locale.ROOT), 0);
    }

    public Optional<Worker> worker(String workerId) {
        return Optional.ofNullable(workers.get(workerId));
    }

    /** Every NPC worker, in no particular order. */
    public List<NpcWorker> npcWorkers() {
        return workers.values().stream()
                .filter(NpcWorker.class::isInstance)
                .map(NpcWorker.class::cast)
                .toList();
    }

    /** Every hired player. */
    public List<PlayerWorker> playerWorkers() {
        return workers.values().stream()
                .filter(PlayerWorker.class::isInstance)
                .map(PlayerWorker.class::cast)
                .toList();
    }

    /** The hired record for a player, if they work here. */
    public Optional<PlayerWorker> workerFor(UUID player) {
        return playerWorkers().stream()
                .filter(worker -> worker.player().equals(player))
                .findFirst();
    }

    /**
     * Whether somebody may do something at this business.
     *
     * The owner may do everything, always — see {@link PlayerWorker} on why they are never also a
     * worker. Anybody else needs to have been hired and granted the permission.
     */
    public boolean mayAct(UUID player, String permission) {
        return ownedBy(player) || workerFor(player).map(worker -> worker.may(permission)).orElse(false);
    }

    /**
     * Whether the licence snapshot says this business has lapsed.
     *
     * A snapshot of zero — nobody has ever been able to look — answers false. See the class notes on
     * why that direction is the only acceptable one.
     */
    public boolean licenseLapsed(long now) {
        return licenseExpiresAt > 0 && licenseExpiresAt <= now;
    }

    /** How long until the licence lapses, or zero when it already has or was never observed. */
    public long licenseRemaining(long now) {
        return licenseExpiresAt <= 0 ? 0L : Math.max(0L, licenseExpiresAt - now);
    }

    // ─── Mutations ────────────────────────────────────────────────────────────────────────────
    //
    // Each returns a new instance. Nothing here writes to storage; that is the service's decision,
    // which is what lets a multi-step operation be assembled and then committed or thrown away.
    //
    // They go through the builder below rather than each restating all eighteen components. That was
    // tolerable at fourteen and is not at eighteen: a mutator that forgets one field silently resets
    // it, and the field most likely to be forgotten is whichever was added last — which for this
    // record has twice been somebody's stored items.

    public Workspace withStorage(WorkspaceStorage next) {
        return toBuilder().storage(next).build();
    }

    /**
     * Raises the base level.
     *
     * Storage, upgrades, NPC records and the licence snapshot all carry across untouched, and
     * deliberately visibly: the brief is that a player must never lose anything by upgrading, and the
     * way to guarantee that is for the upgrade path to have no opportunity to touch them at all.
     */
    public Workspace withLevel(int next, long now) {
        return toBuilder().level(next).lastUpgradeAt(now).build();
    }

    /** Sets an upgrade's level, or removes it when set to zero or less. */
    public Workspace withUpgrade(String upgradeId, int upgradeLevel, long now) {
        Map<String, Integer> next = new LinkedHashMap<>(upgrades);
        String key = upgradeId.toLowerCase(java.util.Locale.ROOT);

        if (upgradeLevel <= 0) {
            next.remove(key);
        } else {
            next.put(key, upgradeLevel);
        }

        return toBuilder().upgrades(next).lastUpgradeAt(now).build();
    }

    /** Strips every upgrade. Used by the abandonment path, and by nothing else. */
    public Workspace withoutUpgrades() {
        return toBuilder().upgrades(Map.of()).build();
    }

    /** Records a worker, replacing whatever was under that id. */
    public Workspace withWorker(Worker worker) {
        Map<String, Worker> next = new LinkedHashMap<>(workers);
        next.put(worker.id(), worker);

        return toBuilder().workers(next).build();
    }

    public Workspace withoutWorker(String workerId) {
        if (!workers.containsKey(workerId)) {
            return this;
        }

        Map<String, Worker> next = new LinkedHashMap<>(workers);
        next.remove(workerId);

        return toBuilder().workers(next).build();
    }

    /** Dismisses everybody. Used by the abandonment path, and by nothing else. */
    public Workspace withoutWorkers() {
        return toBuilder().workers(Map.of()).build();
    }

    /** Records an NPC in a role, replacing whatever was there. */
    public Workspace withNpc(String role, NpcHandle handle) {
        Map<String, NpcHandle> next = new LinkedHashMap<>(npcs);
        next.put(role, handle);

        return toBuilder().npcs(next).build();
    }

    public Workspace withoutNpc(String role) {
        if (!npcs.containsKey(role)) {
            return this;
        }

        Map<String, NpcHandle> next = new LinkedHashMap<>(npcs);
        next.remove(role);

        return toBuilder().npcs(next).build();
    }

    public Optional<NpcHandle> npc(String role) {
        return Optional.ofNullable(npcs.get(role));
    }

    /**
     * Which role an NPC fills here, if it is one of this business's.
     *
     * The reverse of {@link #npc}, and the answer the interaction listener needs: it starts from a
     * clicked NPC and has to find out what that NPC is for. There are at most a handful of roles per
     * business, so a scan is the right shape — a second index would be state that can disagree with
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
        return toBuilder().lastAccessAt(now).build();
    }

    /**
     * Records what the owner's workspace licence looked like when somebody could last see it.
     *
     * @param expiresAt epoch millis, or 0 for "they are not carrying one" — which is a lapse, not an
     *                  absence of information, and is recorded as an expiry in the past by the caller
     */
    public Workspace withLicenseSnapshot(long expiresAt, long now) {
        return toBuilder().licenseExpiresAt(expiresAt).licenseCheckedAt(now).build();
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
        return toBuilder().lastTaxPaidAt(now).build();
    }

    /**
     * Suspends or restores the business's services.
     *
     * Suspension disables the NPCs and nothing else. It never removes ownership, storage, levels,
     * upgrades or the region — the point is to make maintenance matter, not to delete months of a
     * player's work because they were away for a fortnight.
     */
    public Workspace taxSuspended(boolean suspended) {
        return toBuilder().taxSuspended(suspended).build();
    }

    /** Sets a forward-compatibility value. How a future system stores state without a schema change. */
    public Workspace withExtra(String key, String value) {
        Map<String, String> next = new LinkedHashMap<>(extras);

        if (value == null) {
            next.remove(key);
        } else {
            next.put(key, value);
        }

        return toBuilder().extras(next).build();
    }

    public Optional<String> extra(String key) {
        return Optional.ofNullable(extras.get(key));
    }

    /**
     * Reassigns the business to a new profession and returns it to a fresh state.
     *
     * The abandonment path's one mutation, kept here rather than assembled in the service so that
     * "what survives an abandonment" is a single readable list rather than a sequence of calls
     * somebody could reorder. Identity, place and protected area survive; everything a previous
     * owner built or bought does not.
     */
    public Workspace abandoned(String newProfessionId, long now) {
        return toBuilder()
                .professionId(newProfessionId)
                .level(1)
                .upgrades(Map.of())
                .workers(Map.of())
                .storage(WorkspaceStorage.EMPTY)
                .npcs(Map.of())
                .lastAccessAt(now)
                .lastTaxPaidAt(0L)
                .lastUpgradeAt(0L)
                .licenseExpiresAt(0L)
                .licenseCheckedAt(0L)
                .taxSuspended(false)
                // Cleared wholesale. Extras belong to systems that attached themselves to the
                // previous owner's business; carrying them into the next owner's would hand over
                // state nobody can attribute and nothing knows how to reset.
                .extras(Map.of())
                .build();
    }

    // ─── Builder ──────────────────────────────────────────────────────────────────────────────

    /**
     * A mutable copy, for building the next instance.
     *
     * Package-private on purpose: this is an implementation detail of the mutators above, not a way
     * for a caller to assemble an arbitrary business. Everything outside goes through a named
     * {@code with…} method, so every legal transition has a name and a reason written next to it.
     */
    Builder toBuilder() {
        return new Builder(this);
    }

    static final class Builder {

        private String id;
        private UUID owner;
        private String professionId;
        private String structureId;
        private WorldPoint anchor;
        private WorkspaceRegion region;
        private int level;
        private Map<String, Integer> upgrades;
        private Map<String, Worker> workers;
        private WorkspaceStorage storage;
        private Map<String, NpcHandle> npcs;
        private long createdAt;
        private long lastAccessAt;
        private long lastTaxPaidAt;
        private long lastUpgradeAt;
        private long licenseExpiresAt;
        private long licenseCheckedAt;
        private boolean taxSuspended;
        private Map<String, String> extras;

        private Builder(Workspace from) {
            this.id = from.id;
            this.owner = from.owner;
            this.professionId = from.professionId;
            this.structureId = from.structureId;
            this.anchor = from.anchor;
            this.region = from.region;
            this.level = from.level;
            this.upgrades = from.upgrades;
            this.workers = from.workers;
            this.storage = from.storage;
            this.npcs = from.npcs;
            this.createdAt = from.createdAt;
            this.lastAccessAt = from.lastAccessAt;
            this.lastTaxPaidAt = from.lastTaxPaidAt;
            this.lastUpgradeAt = from.lastUpgradeAt;
            this.licenseExpiresAt = from.licenseExpiresAt;
            this.licenseCheckedAt = from.licenseCheckedAt;
            this.taxSuspended = from.taxSuspended;
            this.extras = from.extras;
        }

        Builder professionId(String value) {
            this.professionId = value;
            return this;
        }

        Builder level(int value) {
            this.level = value;
            return this;
        }

        Builder upgrades(Map<String, Integer> value) {
            this.upgrades = value;
            return this;
        }

        Builder workers(Map<String, Worker> value) {
            this.workers = value;
            return this;
        }

        Builder storage(WorkspaceStorage value) {
            this.storage = value;
            return this;
        }

        Builder npcs(Map<String, NpcHandle> value) {
            this.npcs = value;
            return this;
        }

        Builder lastAccessAt(long value) {
            this.lastAccessAt = value;
            return this;
        }

        Builder lastTaxPaidAt(long value) {
            this.lastTaxPaidAt = value;
            return this;
        }

        Builder lastUpgradeAt(long value) {
            this.lastUpgradeAt = value;
            return this;
        }

        Builder licenseExpiresAt(long value) {
            this.licenseExpiresAt = value;
            return this;
        }

        Builder licenseCheckedAt(long value) {
            this.licenseCheckedAt = value;
            return this;
        }

        Builder taxSuspended(boolean value) {
            this.taxSuspended = value;
            return this;
        }

        Builder extras(Map<String, String> value) {
            this.extras = value;
            return this;
        }

        Workspace build() {
            return new Workspace(id, owner, professionId, structureId, anchor, region, level,
                    upgrades, workers, storage, npcs, createdAt, lastAccessAt, lastTaxPaidAt,
                    lastUpgradeAt, licenseExpiresAt, licenseCheckedAt, taxSuspended, extras);
        }
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

        JsonObject upgradeJson = new JsonObject();
        upgrades.forEach(upgradeJson::addProperty);
        json.add("upgrades", upgradeJson);

        JsonObject workerJson = new JsonObject();
        workers.forEach((workerId, worker) -> workerJson.add(workerId, worker.toJson()));
        json.add("workers", workerJson);

        JsonObject npcJson = new JsonObject();
        npcs.forEach((role, handle) -> npcJson.addProperty(role, handle.serialise()));
        json.add("npcs", npcJson);

        json.addProperty("createdAt", createdAt);
        json.addProperty("lastAccessAt", lastAccessAt);
        json.addProperty("lastTaxPaidAt", lastTaxPaidAt);
        json.addProperty("lastUpgradeAt", lastUpgradeAt);
        json.addProperty("licenseExpiresAt", licenseExpiresAt);
        json.addProperty("licenseCheckedAt", licenseCheckedAt);
        json.addProperty("taxSuspended", taxSuspended);

        // Written back verbatim, so a field this version does not know about survives a round trip.
        JsonObject extraJson = new JsonObject();
        extras.forEach(extraJson::addProperty);
        json.add("extras", extraJson);

        return json;
    }

    /**
     * Reads a stored business.
     *
     * @return empty only when a field it cannot function without is missing or unreadable — the id,
     *         the owner, or the region. Everything else falls back, so a record from an older
     *         version loads rather than being discarded
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
                    // An unparseable handle is dropped rather than failing the business: the NPC is
                    // respawnable, the business is not.
                    NpcHandle.parse(npcJson.get(role).getAsString())
                            .ifPresent(handle -> npcs.put(role, handle));
                }
            }

            Map<String, Integer> upgrades = new LinkedHashMap<>();

            if (json.has("upgrades") && json.get("upgrades").isJsonObject()) {
                JsonObject upgradeJson = json.getAsJsonObject("upgrades");

                for (String key : upgradeJson.keySet()) {
                    try {
                        int bought = upgradeJson.get(key).getAsInt();

                        if (bought > 0) {
                            upgrades.put(key, bought);
                        }
                    } catch (RuntimeException notANumber) {
                        // Dropped rather than failing the record, like an NPC handle: a lost upgrade
                        // level is repairable by an operator, an unloadable business is not.
                    }
                }
            }

            Map<String, Worker> workers = new LinkedHashMap<>();

            if (json.has("workers") && json.get("workers").isJsonObject()) {
                JsonObject workerJson = json.getAsJsonObject("workers");

                for (String workerId : workerJson.keySet()) {
                    if (!workerJson.get(workerId).isJsonObject()) {
                        continue;
                    }

                    // An unreadable worker is dropped, not fatal. Losing one employee's record is
                    // repairable by rehiring; refusing to load the business is not.
                    Worker.fromJson(workerJson.getAsJsonObject(workerId))
                            .ifPresent(worker -> workers.put(worker.id(), worker));
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
                    upgrades,
                    workers,
                    json.has("storage") && json.get("storage").isJsonObject()
                            ? WorkspaceStorage.fromJson(json.getAsJsonObject("storage"))
                            : WorkspaceStorage.EMPTY,
                    npcs,
                    number(json, "createdAt", now),
                    number(json, "lastAccessAt", now),
                    number(json, "lastTaxPaidAt", 0L),
                    number(json, "lastUpgradeAt", 0L),
                    number(json, "licenseExpiresAt", 0L),
                    number(json, "licenseCheckedAt", 0L),
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
