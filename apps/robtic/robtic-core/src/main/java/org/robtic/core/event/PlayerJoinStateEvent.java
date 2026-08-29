package org.robtic.core.event;

import com.google.gson.JsonObject;
import org.bukkit.event.HandlerList;

import java.util.UUID;

/**
 * What the API said about a player when they joined.
 *
 * <h2>One request, many readers</h2>
 *
 * {@code POST /api/server/playerJoin} returns a single document describing everything this server
 * needs to know about an arriving player: whether they are frozen, whether they are jailed and why,
 * how much unread mail they have, their AFK totals, their warning and jail counts.
 *
 * In the monolith one listener read all of it and called five subsystems directly. Split across
 * plugins, the obvious translation — a join listener in each plugin — would mean five identical API
 * calls on every join, on a path that runs while the player is waiting to be let in. That is exactly
 * the duplicated infrastructure the refactor exists to remove.
 *
 * So RobticCore makes the call once and publishes the answer. RobticStaff reads the freeze and jail
 * fields, RobticMail reads the unread count, RobticEssentials reads the AFK totals, and none of them
 * knows the others are listening.
 *
 * <h2>Fired on the main thread, after an asynchronous request</h2>
 *
 * The request runs off the tick — the whole point is not to block the join — but the event is fired
 * back on the main thread once it returns. Firing from the worker would be marginally faster and
 * would make every listener responsible for hopping back before it touched the world, which is the
 * single easiest thing to get wrong in a Bukkit listener. One tick of latency buys five listeners
 * that cannot make that mistake.
 *
 * <h2>The document is raw on purpose</h2>
 *
 * Core does not model fields it has no use for. A field added to the API tomorrow is readable by
 * whichever plugin cares about it without Core being edited or redeployed, which is what keeps this
 * event from becoming a bottleneck every future feature has to pass through.
 */
public final class PlayerJoinStateEvent extends RobticPlayerEvent {

    private static final HandlerList HANDLERS = new HandlerList();

    private final String username;
    private final JsonObject state;

    /**
     * @param state the API's response, or an empty object when it could not be reached — never null,
     *              so a listener never has to decide whether an outage means "absent" or "false"
     */
    public PlayerJoinStateEvent(UUID playerId, String username, JsonObject state) {
        super(playerId);

        this.username = username;
        this.state = state == null ? new JsonObject() : state;
    }

    public String username() {
        return username;
    }

    /** The whole document. Read what you need; ignore the rest. */
    public JsonObject state() {
        return state;
    }

    /** Whether the API answered at all. False after an outage, when every field would read absent. */
    public boolean resolved() {
        return !state.keySet().isEmpty();
    }

    public boolean flag(String key) {
        return state.has(key) && !state.get(key).isJsonNull() && state.get(key).getAsBoolean();
    }

    public long number(String key) {
        return state.has(key) && !state.get(key).isJsonNull() ? state.get(key).getAsLong() : 0L;
    }

    public String text(String key) {
        return state.has(key) && !state.get(key).isJsonNull() ? state.get(key).getAsString() : null;
    }

    /** A nested object, or an empty one — so a caller never null-checks before reading fields. */
    public JsonObject section(String key) {
        return state.has(key) && state.get(key).isJsonObject()
                ? state.getAsJsonObject(key)
                : new JsonObject();
    }

    @Override
    public HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
