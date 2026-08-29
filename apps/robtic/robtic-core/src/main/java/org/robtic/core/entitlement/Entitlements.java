package org.robtic.core.entitlement;

import com.google.gson.JsonObject;

/**
 * What a player's tier entitles them to.
 *
 * <h2>Why this is in Core and not in RobticPremium</h2>
 *
 * Three plugins need this record and none of them may depend on the others. RobticEssentials reads
 * it to decide how many homes a player may set and whether their ender chest is portable;
 * RobticPremium reads it to decide which LuckPerms group to apply; RobticJobs will read it for
 * workspace limits. Putting it in any one of them would make the other two depend on that one.
 *
 * It is also, straightforwardly, player data from the API — which is Core's, in the same way
 * {@code PlayerProfile} is.
 *
 * <h2>Every limit is data, never a constant</h2>
 *
 * The plugin enforces nothing it invented. A tier change made on Discord is reflected the next time
 * this record is fetched, with no plugin edit and no restart — which is the whole reason the limits
 * live in a record rather than in a config file the server would have to keep in step.
 *
 * @param tierId         null for a player with no premium tier; see {@link #isPremium()}
 * @param tierName       shown to players; "None" when there is no tier
 * @param level          higher is more, and the scale belongs to whoever defines the tiers
 * @param homeLimit      how many homes may be set
 * @param backUses       how many {@code /back} uses are granted per budget window
 * @param lockedChestLimit how many chests may be locked
 * @param portableChest  whether the ender chest can be opened anywhere
 * @param cosmetics      whether cosmetic features are available
 * @param luckPermsGroup the group applied while the tier is held, or null for none
 */
public record Entitlements(
        String tierId,
        String tierName,
        int level,
        int homeLimit,
        int backUses,
        int lockedChestLimit,
        boolean portableChest,
        boolean cosmetics,
        String luckPermsGroup
) {

    /** What a player gets when the API cannot be reached and nothing is cached. */
    public static Entitlements free(int homeLimit) {
        return new Entitlements(null, "None", 0, homeLimit, 0, 0, false, false, null);
    }

    /**
     * Everything unlocked, for a player holding {@code robtic.tester}.
     *
     * <h2>Local only, and deliberately not a tier</h2>
     *
     * {@code tierId} stays null, so nothing downstream mistakes a tester for a paying member: the
     * premium sync will not grant them a tier's LuckPerms group, and the API is never told they have
     * one. This exists so staff can exercise a premium feature without buying it, and the limits it
     * lifts are the ones this server enforces in memory.
     *
     * The server-side limits — how many homes the API will store, how much {@code /back} budget it
     * grants — are unaffected, because those are the API's answer and this is a game server's
     * opinion. A tester who needs those raised needs them raised on the account.
     */
    public static Entitlements tester() {
        return new Entitlements(
                null,
                "Tester",
                Integer.MAX_VALUE,
                Integer.MAX_VALUE,
                Integer.MAX_VALUE,
                Integer.MAX_VALUE,
                true,
                true,
                null);
    }

    public boolean isPremium() {
        return tierId != null;
    }

    public static Entitlements fromJson(JsonObject json) {
        return new Entitlements(
                string(json, "tierId", null),
                string(json, "tierName", "None"),
                integer(json, "level", 0),
                integer(json, "homeLimit", 0),
                integer(json, "backUses", 0),
                integer(json, "lockedChestLimit", 0),
                bool(json, "portableChest"),
                bool(json, "cosmetics"),
                string(json, "luckPermsGroup", null));
    }

    // ─── JSON helpers ─────────────────────────────────────────────────────────────────────────
    //
    // Self-contained rather than shared with the survival models this record used to live inside.
    // A missing or null field must read as its fallback rather than throwing: this is parsed from an
    // API response, and a field added or removed on the server side must not stop a player joining.

    private static String string(JsonObject json, String key, String fallback) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsString() : fallback;
    }

    private static int integer(JsonObject json, String key, int fallback) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsInt() : fallback;
    }

    private static boolean bool(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() && json.get(key).getAsBoolean();
    }
}
