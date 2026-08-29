package org.robtic.minecraft.auth;

import com.google.gson.JsonObject;
import org.bukkit.Location;

/**
 * What this server currently believes about one connected player's identity.
 *
 * <h2>Held in memory, and only in memory</h2>
 *
 * Authentication is a property of a *connection*, not of an account: it begins when a player joins
 * and ends when they leave. Persisting it would mean a server that crashed mid-session could come
 * back believing somebody was authenticated who is no longer there — and the session that genuinely
 * survives a restart is the one the API holds, which is re-read on the next join anyway.
 *
 * @param outcome        what the API said to do with them, verbatim. The plugin never second-guesses
 *                       it; it only decides where to put them.
 * @param authenticated  whether restrictions are currently lifted. Distinct from {@code outcome}
 *                       because a player who logs in successfully keeps their original outcome —
 *                       the reason they were asked — while this flips.
 * @param returnTo       where to put them once they are in. Captured before the link world moves
 *                       them, for the same reason {@code AfkSnapshot} captures a location: the
 *                       server would otherwise save them wherever authentication left them.
 */
public record AuthState(
        Outcome outcome,
        boolean authenticated,
        boolean linked,
        String discordId,
        boolean hasPassword,
        Location returnTo,
        long promptedAt,
        long retryAfterMs
) {

    /** Mirrors `AuthOutcome` in libs/sdk. The two lists must agree. */
    public enum Outcome {
        /** No Discord link: the link world and `/link`. */
        NEEDS_LINK,
        /** Linked with a password: show the login GUI. */
        NEEDS_LOGIN,
        /** Linked with no password yet — a link made before RobticAuth, or an admin reset. */
        NEEDS_PASSWORD,
        /** A live session was accepted: straight in. */
        AUTHENTICATED;

        static Outcome parse(String raw) {
            if (raw == null) {
                return NEEDS_LOGIN;
            }

            return switch (raw) {
                case "needs_link" -> NEEDS_LINK;
                case "needs_password" -> NEEDS_PASSWORD;
                case "authenticated" -> AUTHENTICATED;
                // Anything this build has not heard of is treated as "ask for a password", which is
                // the outcome that refuses access rather than granting it. A newer API adding a case
                // must not accidentally let somebody in through an older plugin.
                default -> NEEDS_LOGIN;
            };
        }
    }

    /** Reads the `/api/auth/state` response. */
    public static AuthState fromJson(JsonObject json, Location returnTo) {
        Outcome outcome = Outcome.parse(text(json, "outcome"));

        return new AuthState(
                outcome,
                outcome == Outcome.AUTHENTICATED,
                bool(json, "linked"),
                text(json, "discordId"),
                bool(json, "hasPassword"),
                returnTo,
                System.currentTimeMillis(),
                json.has("retryAfterMs") && !json.get("retryAfterMs").isJsonNull()
                        ? json.get("retryAfterMs").getAsLong()
                        : 0L
        );
    }

    /** The state a player is put in when the API cannot be reached. Refuses, rather than admits. */
    public static AuthState unavailable(Location returnTo) {
        return new AuthState(Outcome.NEEDS_LOGIN, false, false, null, false, returnTo,
                System.currentTimeMillis(), 0L);
    }

    /** The same state, authenticated. Keeps the outcome, which records why they were asked. */
    public AuthState asAuthenticated() {
        return new AuthState(outcome, true, linked, discordId, hasPassword, returnTo, promptedAt, 0L);
    }

    /** The same state with a fresh rate-limit wait, after a refused login. */
    public AuthState withRetryAfter(long millis) {
        return new AuthState(outcome, authenticated, linked, discordId, hasPassword, returnTo,
                promptedAt, millis);
    }

    /** The same state once a password has been set, so the GUI stops offering recovery. */
    public AuthState withPassword() {
        return new AuthState(Outcome.NEEDS_LOGIN, authenticated, linked, discordId, true, returnTo,
                promptedAt, retryAfterMs);
    }

    /** True when the player is being asked to link rather than to log in. */
    public boolean needsLink() {
        return outcome == Outcome.NEEDS_LINK;
    }

    /** How long they have been waiting to authenticate, for the join timeout. */
    public long pendingMillis() {
        return System.currentTimeMillis() - promptedAt;
    }

    private static boolean bool(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() && json.get(key).getAsBoolean();
    }

    private static String text(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsString() : null;
    }
}
