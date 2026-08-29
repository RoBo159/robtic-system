package org.robtic.essentials.lobby;

import com.google.gson.JsonObject;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.essentials.survival.SurvivalCacheService;

import java.util.UUID;

/**
 * Who can see whom — the single owner of that question.
 *
 * <h2>Two rules, one place</h2>
 *
 * <ul>
 *   <li><b>`/players`</b>, a lobby preference. One-directional: it hides other people from the
 *       player who asked, and nobody else is affected. Bukkit's {@code hidePlayer} is per-viewer,
 *       which is exactly that semantic — somebody who wants a quiet lobby gets one without becoming
 *       invisible to everyone else.</li>
 *   <li><b>AFK</b>, which is not a preference and is not one-directional. An AFK player sees nobody
 *       <em>and</em> is seen by nobody, so no two AFK players ever meet and nobody watches somebody
 *       stand idle. It is applied on entering the AFK world and undone on leaving, with no command
 *       involved.</li>
 * </ul>
 *
 * Both live here rather than in the features that own them, because they are answers to the same
 * question about the same pair of players. Split across two services they would each call
 * {@code showPlayer} on players the other had deliberately hidden, and which of them won would come
 * down to ordering — the AFK player made visible again by a lobby pass that ran a tick later.
 *
 * <h2>Applied on join and re-applied when anybody joins</h2>
 *
 * A player who hid others and then sees a new arrival connect would see them appear, because the
 * hide list only covered who was online at the time. {@link #applyToAll} is therefore run for the
 * joining player *and* for everyone already hiding — and for the same reason on every AFK
 * transition, since going AFK changes what everybody else may see, not just the one who went.
 */
public final class PlayerVisibilityService {

    /**
     * Lets the holder see every hidden player: AFK, unauthenticated, and vanished staff.
     *
     * Op by default. A permission rather than a raw {@code isOp()} check so a server can grant it to
     * a moderator group without granting them everything else op implies.
     */
    private static final String SEE_HIDDEN = "robtic.staff.seehidden";

    private final Plugin plugin;
    private final LobbyConfiguration config;
    private final SurvivalCacheService cache;

    /**
     * Whether a player is currently AFK. Injected, so this never depends on the AFK module.
     *
     * Defaults to "nobody is", which is the correct answer when the AFK feature is switched off and
     * means this class works unchanged whether or not it is wired up.
     */
    private volatile java.util.function.Predicate<UUID> afk = uuid -> false;

    /**
     * Whether a player has yet to authenticate. Injected, like the AFK check.
     *
     * A player waiting in the link world is alone for the same reason an AFK player is: they are not
     * really present. It also means somebody who has not proved who they are cannot watch the server,
     * and cannot be seen loitering at spawn by players who would reasonably wonder who they are.
     */
    private volatile java.util.function.Predicate<UUID> unauthenticated = uuid -> false;

    /** Whether a player is vanished by `/hide`. Injected, so this never depends on the staff module. */
    private volatile java.util.function.Predicate<UUID> vanished = uuid -> false;

    /** Whether a player may see vanished staff — on-duty staff, in practice. */
    private volatile java.util.function.Predicate<UUID> canSeeVanished = uuid -> false;

    public PlayerVisibilityService(Plugin plugin, LobbyConfiguration config, SurvivalCacheService cache) {
        this.plugin = plugin;
        this.config = config;
        this.cache = cache;
    }

    /** Registers how "is this player AFK?" is answered. Must be a memory read: this runs on the tick. */
    public void afkWhen(java.util.function.Predicate<UUID> predicate) {
        this.afk = predicate;
    }

    /** Registers how "has this player authenticated?" is answered. Also a memory read. */
    public void unauthenticatedWhen(java.util.function.Predicate<UUID> predicate) {
        this.unauthenticated = predicate;
    }

    /**
     * Registers the vanish rules: who is hidden, and who is allowed to see them anyway.
     *
     * Taken together rather than separately because they are two halves of one rule, and a service
     * that knew about hidden players but not about who may see them would hide staff from each
     * other.
     */
    public void vanishWhen(
            java.util.function.Predicate<UUID> hidden,
            java.util.function.Predicate<UUID> maySeeHidden
    ) {
        this.vanished = hidden;
        this.canSeeVanished = maySeeHidden;
    }

    /**
     * Whether this player is invisible to everyone and everyone is invisible to them.
     *
     * Two unrelated features arrive at the same rule — AFK and unauthenticated — so they are folded
     * into one question here rather than being applied by two passes that would each undo the
     * other's `showPlayer` calls.
     */
    private boolean isolated(UUID uuid) {
        return afk.test(uuid) || unauthenticated.test(uuid);
    }

    /**
     * Applies one player's visibility to everybody currently online, in both directions.
     *
     * Main thread only. The AFK rule is symmetric and is therefore applied to both ends of every
     * pair here: the viewer stops seeing an AFK player, and an AFK player stops seeing the viewer.
     * Doing only the first would leave an AFK player watching the server go about its business,
     * which is the opposite of being alone.
     *
     * The lobby preference stays one-directional and stays a lobby thing — carrying it into survival
     * would hide players in a world where seeing them matters.
     */
    public void apply(Player viewer) {
        for (Player other : plugin.getServer().getOnlinePlayers()) {
            if (other.equals(viewer)) {
                continue;
            }

            // Both directions, every time. `canSee` is a pure function of the two players' states,
            // so computing it for a pair is idempotent and order no longer decides anything — which
            // is the whole point: this used to assert one direction conditionally, and a second
            // service asserting the other is how a vanished admin got revealed by an unrelated pass.
            show(viewer, other, canSee(viewer, other));
            show(other, viewer, canSee(other, viewer));
        }
    }

    /**
     * Whether {@code viewer} may see {@code target}, considering every rule at once.
     *
     * <h2>One function, four features</h2>
     *
     * The lobby preference, AFK, authentication and vanish all answer the same question about the
     * same pair, and each used to answer it in its own pass. Two passes disagreeing meant the last
     * one to run won — so a vanished staff member became visible the moment somebody went AFK, and a
     * hidden AFK player reappeared when a vanish toggle recomputed. Folding them here makes the
     * answer a single expression that cannot contradict itself.
     */
    private boolean canSee(Player viewer, Player target) {
        // Staff who hold the bypass see everybody, whatever anything else here decides.
        //
        // Checked before every other rule rather than folded into one of them, because the point of
        // it is to be unconditional: an administrator investigating a report needs to see the AFK
        // player, the one waiting in the link world and the vanished colleague alike, and a bypass
        // that covered only some of those would be one they could not rely on.
        //
        // It governs what the holder SEES and nothing else. Their own visibility to other players is
        // decided by their own row of this same function, so an op who vanishes is still hidden.
        if (viewer.hasPermission(SEE_HIDDEN)) {
            return true;
        }

        // An isolated viewer sees nobody, and nobody sees an isolated target. Symmetric on purpose:
        // an AFK or unauthenticated player is not really present.
        if (isolated(viewer.getUniqueId()) || isolated(target.getUniqueId())) {
            return false;
        }

        // The lobby's `/players` toggle: one-directional, and only inside the lobby.
        if (prefersHidden(viewer)) {
            return false;
        }

        // Vanish: invisible to ordinary players, visible to staff who are themselves on duty.
        return !vanished.test(target.getUniqueId()) || canSeeVanished.test(viewer.getUniqueId());
    }

    private void show(Player viewer, Player target, boolean visible) {
        if (visible) {
            viewer.showPlayer(plugin, target);
        } else {
            viewer.hidePlayer(plugin, target);
        }
    }

    /**
     * Re-applies every online player's preference.
     *
     * Run when somebody joins or changes world, so a new arrival is hidden from those who asked not
     * to see anybody rather than appearing until they next toggle the setting.
     */
    public void applyToAll() {
        for (Player viewer : plugin.getServer().getOnlinePlayers()) {
            apply(viewer);
        }
    }

    /** Whether this viewer has asked not to see other players, here and now. */
    private boolean prefersHidden(Player viewer) {
        return config.isLobby(viewer.getWorld().getName())
                && !cache.cachedSettings(viewer.getUniqueId()).playersVisible();
    }

    /**
     * Toggles the setting and persists it. Off-thread — it calls the API.
     *
     * @return the new visibility, so the caller can report it without reading back.
     */
    public boolean toggle(UUID uuid) {
        boolean visible = !cache.cachedSettings(uuid).playersVisible();

        JsonObject changes = new JsonObject();
        changes.addProperty("playersVisible", visible);
        cache.updateSettings(uuid, changes);

        return visible;
    }

    /**
     * Re-evaluates a player's visibility on leaving the lobby. Main thread.
     *
     * This used to show everybody unconditionally, which was correct while the lobby preference was
     * the only reason anyone was ever hidden. It is not any more: an unconditional pass here would
     * reveal every AFK player to somebody who simply walked out of the lobby, and reveal them to the
     * AFK players in turn. Re-applying the rules gets the intended effect — the lobby preference
     * stops applying outside the lobby — without asserting anything about the players AFK is hiding.
     */
    public void showAll(Player viewer) {
        apply(viewer);
    }
}
