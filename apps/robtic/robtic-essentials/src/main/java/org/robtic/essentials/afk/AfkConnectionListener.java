package org.robtic.essentials.afk;

import com.google.gson.JsonObject;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.robtic.core.event.PlayerJoinStateEvent;

/**
 * Seeds a player's AFK totals from the join state.
 *
 * <h2>Why these have to arrive before the first tick counts</h2>
 *
 * The AFK reward service settles a session against a running total, and the API is the authority for
 * that total — this server may be one of several the player has been idle on. Seeding it from the
 * join document means the first settlement of the session is measured against the real figure rather
 * than against zero, which would pay them for time they had already been paid for.
 *
 * The totals travel on the same document as everything else, so this costs no request of its own.
 *
 * <h2>No quit handler here, deliberately</h2>
 *
 * The AFK cache is dropped by {@code AfkService#forget}, which has to settle the session first. A
 * quit handler in this class would race it and could throw away the rounding residue the settlement
 * is about to use — a bug that would present as a few robs going missing per disconnect and would be
 * very hard to attribute.
 */
public final class AfkConnectionListener implements Listener {

    private final AfkRewardService rewards;

    public AfkConnectionListener(AfkRewardService rewards) {
        this.rewards = rewards;
    }

    @EventHandler
    public void onJoinState(PlayerJoinStateEvent event) {
        JsonObject afk = event.section("afk");

        if (afk.keySet().isEmpty()) {
            return;
        }

        rewards.seed(event.getPlayerId(), AfkStatistics.of(
                longValue(afk, "totalMs"),
                longValue(afk, "todayMs"),
                text(afk, "todayDate"),
                longValue(afk, "robs")));
    }

    private static long longValue(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsLong() : 0L;
    }

    private static String text(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsString() : null;
    }
}
