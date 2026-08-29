package org.robtic.jobs.workspace.worker;

import com.google.gson.JsonObject;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * A real player hired by the owner of a business.
 *
 * <h2>Permissions are strings, and that is the extension point</h2>
 *
 * {@link #permissions} holds arbitrary tokens — {@code deposit}, {@code withdraw}, {@code sell},
 * {@code hire} — and each system that guards something asks whether the worker holds the one it
 * cares about. The alternative, a boolean field per capability, would mean editing this record and
 * its persistence every time anything in the business became delegable.
 *
 * The constants below are what ships. Nothing stops a future system defining its own, which is the
 * point.
 *
 * <h2>The owner is never a worker</h2>
 *
 * Ownership already grants everything. Hiring the owner would create a second, weaker record of
 * what they may do, and the first time the two disagreed somebody would be locked out of their own
 * business. {@code WorkerService} refuses it.
 *
 * @param id          generated, stable while employed
 * @param player      the account hired
 * @param permissions what they may do; see above
 * @param task        free text set by the owner, shown to the worker. Not enforced by anything —
 *                    it is an instruction, not a capability
 * @param salary      Robs per pay interval
 * @param hiredAt     epoch millis
 * @param lastPaidAt  epoch millis wages were last paid, 0 when never
 */
public record PlayerWorker(
        String id,
        UUID player,
        Set<String> permissions,
        String task,
        double salary,
        long hiredAt,
        long lastPaidAt
) implements Worker {

    /** Put items into the business's storage. */
    public static final String DEPOSIT = "deposit";

    /** Take items out of it. The one worth thinking about before granting. */
    public static final String WITHDRAW = "withdraw";

    /** Sell the business's stock through its seller. */
    public static final String SELL = "sell";

    /** Buy base levels and workspace upgrades, spending the owner's money. */
    public static final String UPGRADE = "upgrade";

    /** Take on and dismiss other workers. */
    public static final String HIRE = "hire";

    /** Everything that ships. A menu offers these; configuration and code may add more. */
    public static final Set<String> KNOWN = Set.of(DEPOSIT, WITHDRAW, SELL, UPGRADE, HIRE);

    public PlayerWorker {
        permissions = Set.copyOf(permissions);
        task = task == null ? "" : task;
        salary = org.robtic.core.util.Robs.sanitise(salary);
    }

    public static PlayerWorker hire(UUID player, Set<String> permissions, double salary, long now) {
        return new PlayerWorker(
                UUID.randomUUID().toString(), player, normalise(permissions), "", salary, now, 0L);
    }

    public boolean may(String permission) {
        return permissions.contains(permission.toLowerCase(Locale.ROOT));
    }

    public PlayerWorker withPermissions(Set<String> replacement) {
        return new PlayerWorker(id, player, normalise(replacement), task, salary, hiredAt, lastPaidAt);
    }

    public PlayerWorker withTask(String replacement) {
        return new PlayerWorker(id, player, permissions, replacement, salary, hiredAt, lastPaidAt);
    }

    public PlayerWorker withSalary(double replacement) {
        return new PlayerWorker(id, player, permissions, task, replacement, hiredAt, lastPaidAt);
    }

    public PlayerWorker paid(long now) {
        return new PlayerWorker(id, player, permissions, task, salary, hiredAt, now);
    }

    private static Set<String> normalise(Set<String> raw) {
        Set<String> normalised = new LinkedHashSet<>();

        if (raw != null) {
            raw.forEach(value -> normalised.add(value.trim().toLowerCase(Locale.ROOT)));
        }

        return normalised;
    }

    @Override
    public String describe() {
        return player.toString();
    }

    @Override
    public JsonObject toJson() {
        JsonObject json = new JsonObject();

        json.addProperty("kind", "player");
        json.addProperty("id", id);
        json.addProperty("player", player.toString());
        json.add("permissions", Worker.array(permissions));
        json.addProperty("task", task);
        json.addProperty("salary", salary);
        json.addProperty("hiredAt", hiredAt);
        json.addProperty("lastPaidAt", lastPaidAt);

        return json;
    }

    public static Optional<PlayerWorker> fromJson(JsonObject json) {
        String id = Worker.string(json, "id", "");
        UUID player = Worker.uuid(json, "player");

        // Without an account there is nobody employed, and unlike an NPC handle there is nothing to
        // respawn from. The row is dropped.
        if (id.isBlank() || player == null) {
            return Optional.empty();
        }

        return Optional.of(new PlayerWorker(
                id,
                player,
                Worker.strings(json, "permissions"),
                Worker.string(json, "task", ""),
                Worker.decimal(json, "salary", 0d),
                Worker.number(json, "hiredAt", System.currentTimeMillis()),
                Worker.number(json, "lastPaidAt", 0L)));
    }
}
