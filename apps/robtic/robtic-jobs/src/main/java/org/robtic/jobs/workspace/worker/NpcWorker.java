package org.robtic.jobs.workspace.worker;

import com.google.gson.JsonObject;
import org.robtic.jobs.npc.NpcHandle;

import java.util.Optional;
import java.util.UUID;

/**
 * A permanent employee: an NPC that works a single profession, on its own.
 *
 * <h2>One profession, one area, one destination — and never more</h2>
 *
 * The brief is explicit and the constraint is worth keeping honest, because every part of it exists
 * to make a worker's output attributable. A worker bound to one profession cannot quietly earn from
 * another when the first stops being profitable; one bound to a work area cannot be moved to a
 * richer one without the owner deciding to; one bound to a storage destination puts what it produces
 * somewhere the owner chose.
 *
 * All three are fields here rather than settings looked up elsewhere, so "what is this worker
 * doing?" is answered by reading the record and never by inferring it.
 *
 * <h2>Output is accrued, not mined</h2>
 *
 * A worker does not walk anywhere or break any blocks. It produces its profession's configured
 * output on an interval, into {@link #storageDestination}. See {@code WorkerYieldService} for why:
 * the short version is that a pathfinding employee is a chunk-loading, grief-shaped, lag-generating
 * feature, and an accruing one is arithmetic that works whether or not anybody is nearby.
 *
 * {@link #lastYieldAt} is what makes that arithmetic honest across a restart. Yield is calculated
 * from elapsed time rather than from ticks observed, so a server that was down does not owe
 * anybody anything and a server that was up does not pay twice.
 *
 * @param id                 generated, stable while employed
 * @param professionId       the one job this worker does
 * @param npc                the figure standing in the world, or empty when it could not be spawned
 * @param workAreaId         which marked area it works, from the structure's own markers
 * @param storageDestination where its output goes. Today the business's own storage; a field rather
 *                           than an assumption, so a future warehouse or a second business is a
 *                           value here and not a rewrite
 * @param salary             Robs per pay interval
 * @param hiredAt            epoch millis
 * @param lastYieldAt        epoch millis output was last credited
 * @param lastPaidAt         epoch millis wages were last taken, 0 when never
 * @param maintenanceDueAt   epoch millis the next maintenance falls due
 */
public record NpcWorker(
        String id,
        String professionId,
        Optional<NpcHandle> npc,
        String workAreaId,
        String storageDestination,
        double salary,
        long hiredAt,
        long lastYieldAt,
        long lastPaidAt,
        long maintenanceDueAt
) implements Worker {

    /** Where output goes when the owner has not chosen anything else. */
    public static final String OWN_STORAGE = "self";

    public NpcWorker {
        professionId = professionId == null ? "" : professionId;
        workAreaId = workAreaId == null ? "" : workAreaId;
        storageDestination = storageDestination == null || storageDestination.isBlank()
                ? OWN_STORAGE
                : storageDestination;
        salary = org.robtic.core.util.Robs.sanitise(salary);
    }

    public static NpcWorker hire(
            String professionId,
            String workAreaId,
            double salary,
            long maintenanceIntervalMillis,
            long now
    ) {
        return new NpcWorker(
                UUID.randomUUID().toString(),
                professionId,
                Optional.empty(),
                workAreaId,
                OWN_STORAGE,
                salary,
                now,
                // Yield is measured from the moment of hiring, so a worker taken on now is not
                // immediately owed a backlog for time before it existed.
                now,
                0L,
                now + maintenanceIntervalMillis);
    }

    public NpcWorker withNpc(NpcHandle handle) {
        return new NpcWorker(id, professionId, Optional.ofNullable(handle), workAreaId,
                storageDestination, salary, hiredAt, lastYieldAt, lastPaidAt, maintenanceDueAt);
    }

    public NpcWorker withWorkArea(String area) {
        return new NpcWorker(id, professionId, npc, area, storageDestination, salary, hiredAt,
                lastYieldAt, lastPaidAt, maintenanceDueAt);
    }

    public NpcWorker withDestination(String destination) {
        return new NpcWorker(id, professionId, npc, workAreaId, destination, salary, hiredAt,
                lastYieldAt, lastPaidAt, maintenanceDueAt);
    }

    public NpcWorker yielded(long now) {
        return new NpcWorker(id, professionId, npc, workAreaId, storageDestination, salary, hiredAt,
                now, lastPaidAt, maintenanceDueAt);
    }

    public NpcWorker maintained(long now, long intervalMillis) {
        return new NpcWorker(id, professionId, npc, workAreaId, storageDestination, salary, hiredAt,
                lastYieldAt, now, now + intervalMillis);
    }

    /** Whether maintenance is overdue. An unmaintained worker stops producing; it is never deleted. */
    public boolean maintenanceOverdue(long now) {
        return maintenanceDueAt > 0 && maintenanceDueAt <= now;
    }

    @Override
    public String describe() {
        return professionId.isBlank() ? "Worker" : professionId;
    }

    @Override
    public JsonObject toJson() {
        JsonObject json = new JsonObject();

        json.addProperty("kind", "npc");
        json.addProperty("id", id);
        json.addProperty("profession", professionId);
        npc.ifPresent(handle -> json.addProperty("npc", handle.serialise()));
        json.addProperty("area", workAreaId);
        json.addProperty("destination", storageDestination);
        json.addProperty("salary", salary);
        json.addProperty("hiredAt", hiredAt);
        json.addProperty("lastYieldAt", lastYieldAt);
        json.addProperty("lastPaidAt", lastPaidAt);
        json.addProperty("maintenanceDueAt", maintenanceDueAt);

        return json;
    }

    public static Optional<NpcWorker> fromJson(JsonObject json) {
        String id = Worker.string(json, "id", "");

        if (id.isBlank()) {
            return Optional.empty();
        }

        long now = System.currentTimeMillis();

        return Optional.of(new NpcWorker(
                id,
                Worker.string(json, "profession", ""),
                // A handle that no longer parses is dropped, not fatal: the figure is respawnable
                // from the record, and the record is what matters.
                json.has("npc") ? NpcHandle.parse(json.get("npc").getAsString()) : Optional.empty(),
                Worker.string(json, "area", ""),
                Worker.string(json, "destination", OWN_STORAGE),
                Worker.decimal(json, "salary", 0d),
                Worker.number(json, "hiredAt", now),
                // Defaulting to now rather than 0 matters: a record written before this field
                // existed would otherwise be owed every item since the epoch on the first tick.
                Worker.number(json, "lastYieldAt", now),
                Worker.number(json, "lastPaidAt", 0L),
                Worker.number(json, "maintenanceDueAt", 0L)));
    }
}
