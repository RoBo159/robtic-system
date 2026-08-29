package org.robtic.minecraft.placeholder;

import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;
import org.bukkit.plugin.Plugin;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.afk.AfkRewardService;
import org.robtic.minecraft.afk.AfkService;
import org.robtic.minecraft.cache.BalanceCache;
import org.robtic.minecraft.config.RoleSettings;
import org.robtic.minecraft.model.PlayerProfile;
import org.robtic.minecraft.model.StaffRank;
import org.robtic.minecraft.service.LeaderboardService;
import org.robtic.minecraft.service.PlayerDataService;
import org.robtic.minecraft.service.RoleSyncService;
import org.robtic.minecraft.staff.StaffAvailabilityService;
import org.robtic.minecraft.staff.StaffStatsCache;
import org.robtic.minecraft.util.Durations;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Exposes the plugin's state to any other plugin through PlaceholderAPI.
 *
 * <h2>Placeholders</h2>
 *
 * <pre>
 *   %robtic_robs%                   4200          confirmed + not-yet-delivered robs
 *   %robtic_robs_formatted%         4,200         the same number, grouped
 *   %robtic_robs_pending%           0             robs earned offline, not yet acknowledged
 *   %robtic_linked%                 yes / no
 *   %robtic_discord_id%             2222…         empty when unlinked
 *   %robtic_rank%                   Moderator     display name, or "Player"
 *   %robtic_rank_group%             mod           LuckPerms group, or "default"
 *   %robtic_is_staff%               yes / no      cached; see the note below
 *   %robtic_frozen%                 yes / no
 *   %robtic_jailed%                 yes / no
 *   %robtic_warnings%               0
 *   %robtic_staff_online%           3             staff connected, on duty or not
 *   %robtic_staff_active%           1             staff currently in /admin
 *   %robtic_staff_available%        yes / no      whether a report can be filed
 *   %robtic_staff_rank%             Moderator     this player's staff rank, or "-"
 *   %robtic_staff_mode%             yes / no      whether this player is in /admin
 *   %robtic_staff_session%          1h 12m        how long they have been on duty
 *   %robtic_reports_open%           4             unclaimed reports
 *   %robtic_reports_reviewing%      1             claimed and being handled
 *   %robtic_reports_resolved%       97
 *   %robtic_reports_claimed%        1             held by this staff member
 *   %robtic_staff_total_cases%      42            reports they have closed
 *   %robtic_staff_jails%            18
 *   %robtic_staff_warnings%         31
 *   %robtic_position%               1             place on the robs leaderboard, or "-"
 *   %robtic_top_name_N%             Notch         Nth name on the board, or "-"
 *   %robtic_top_robs_N%             4200          Nth balance, or 0
 *   %robtic_top_robs_formatted_N%   4,200
 *   %robtic_afk%                    yes / no      whether they are in the AFK world right now
 *   %robtic_afk_session%            42m           the current AFK session, or "0m"
 *   %robtic_afk_today%              3h 10m        AFK time today, UTC
 *   %robtic_afk_total%              5d 2h         lifetime AFK time
 *   %robtic_afk_robs%               1240          lifetime robs earned by being AFK
 * </pre>
 *
 * <h2>Everything here is served from memory</h2>
 *
 * PlaceholderAPI resolves on the calling thread, and its callers are things like TAB that re-render
 * for every player on a timer. Nothing in this class may therefore touch the network or block: each
 * value comes from a cache that a background task keeps warm, and a cold cache answers with its
 * fallback rather than waiting. In particular {@code %robtic_is_staff%} and {@code %robtic_rank%}
 * are answered from the player's LuckPerms groups resolved against roles.yml — read from memory,
 * never from Discord and never over the network, which is what makes them safe in a tab list that
 * refreshes every second.
 */
public final class RobticPlaceholders extends PlaceholderExpansion {

    private static final String YES = "yes";
    private static final String NO = "no";
    private static final String UNKNOWN = "-";

    private final Plugin plugin;
    private final PlayerDataService players;
    private final BalanceCache balances;
    private final RoleSettings roles;
    private final LeaderboardService leaderboard;
    private final RoleSyncService roleSync;
    private final StaffAvailabilityService staffAvailability;
    private final StaffStatsCache staffStats;
    private final AfkService afk;
    private final AfkRewardService afkRewards;

    /**
     * Modules contributing their own placeholders under this expansion's identifier.
     *
     * Copy-on-write because it is read on every placeholder resolution — which a tab list does for
     * every player every second — and written only at boot.
     */
    private final java.util.List<Extension> extensions = new java.util.concurrent.CopyOnWriteArrayList<>();

    public RobticPlaceholders(
            Plugin plugin,
            PlayerDataService players,
            BalanceCache balances,
            RoleSettings roles,
            LeaderboardService leaderboard,
            RoleSyncService roleSync,
            StaffAvailabilityService staffAvailability,
            StaffStatsCache staffStats,
            AfkService afk,
            AfkRewardService afkRewards
    ) {
        this.plugin = plugin;
        this.players = players;
        this.balances = balances;
        this.roles = roles;
        this.leaderboard = leaderboard;
        this.roleSync = roleSync;
        this.staffAvailability = staffAvailability;
        this.staffStats = staffStats;
        this.afk = afk;
        this.afkRewards = afkRewards;
    }

    @Override
    public @NotNull String getIdentifier() {
        return "robtic";
    }

    @Override
    public @NotNull String getAuthor() {
        return String.join(", ", plugin.getPluginMeta().getAuthors());
    }

    @Override
    public @NotNull String getVersion() {
        return plugin.getPluginMeta().getVersion();
    }

    /**
     * Kept registered across a PlaceholderAPI reload. Without this the expansion is unregistered on
     * `/papi reload` and every placeholder silently becomes literal text until the server restarts.
     */
    @Override
    public boolean persist() {
        return true;
    }

    @Override
    public String onRequest(OfflinePlayer player, @NotNull String params) {
        String key = params.toLowerCase(Locale.ROOT);

        // Board placeholders are player-independent, so they are answered before the null check
        // below — a leaderboard on a login screen has no player attached.
        if (key.startsWith("top_")) {
            return board(key);
        }

        if (player == null) {
            return null;
        }

        UUID uuid = player.getUniqueId();
        Optional<PlayerProfile> profile = players.cached(uuid);

        return switch (key) {
            case "robs" -> org.robtic.minecraft.util.Robs.format(robs(uuid));
            case "robs_formatted" -> org.robtic.minecraft.util.Robs.format(robs(uuid));
            case "robs_pending" -> org.robtic.minecraft.util.Robs.format(
                    balances.get(uuid).map(BalanceCache.Balance::pending).orElse(0d));
            case "linked" -> yesNo(profile.map(PlayerProfile::linked).orElse(false));
            case "discord_id" -> profile.map(PlayerProfile::discordId).orElse("");
            case "rank" -> rank(uuid).map(StaffRank::displayName).orElse("Player");
            case "rank_group" -> rank(uuid).map(StaffRank::group).orElse("default");
            case "is_staff" -> yesNo(rank(uuid).isPresent());
            case "frozen" -> yesNo(profile.map(PlayerProfile::frozen).orElse(false));
            case "jailed" -> yesNo(profile.map(PlayerProfile::jailed).orElse(false));
            case "warnings" -> String.valueOf(profile.map(PlayerProfile::warningCount).orElse(0));
            // ─── Staff ────────────────────────────────────────────────────────────────────
            //
            // Availability is answered from this server's own memory rather than a cache: staff
            // mode and LuckPerms groups are both local, so the answer is correct at the instant it
            // is asked. Only the database-backed counters below come from the refreshed cache.
            case "staff_online" -> String.valueOf(staffAvailability.onlineStaffCount());
            case "staff_active" -> String.valueOf(staffAvailability.activeCount());
            case "staff_available" -> yesNo(staffAvailability.anyAvailable());
            case "staff_rank" -> staffAvailability.rankOf(uuid).map(StaffRank::displayName).orElse(UNKNOWN);
            case "staff_mode" -> yesNo(staffAvailability.isInStaffMode(uuid));
            case "staff_session" -> sessionDuration(uuid);

            case "reports_open" -> String.valueOf(staffStats.counts().open());
            case "reports_reviewing" -> String.valueOf(staffStats.counts().reviewing());
            case "reports_resolved" -> String.valueOf(staffStats.counts().resolved());
            case "reports_claimed" -> String.valueOf(staffStats.of(uuid).claimed());
            case "staff_total_cases" -> String.valueOf(staffStats.of(uuid).handled());
            case "staff_jails" -> String.valueOf(staffStats.of(uuid).jails());
            case "staff_warnings" -> String.valueOf(staffStats.of(uuid).warnings());

            case "position" -> leaderboard.forUuid(uuid.toString())
                    .map(entry -> String.valueOf(entry.position()))
                    .orElse(UNKNOWN);

            // ─── AFK ──────────────────────────────────────────────────────────────────────
            //
            // Two memory reads and no arithmetic beyond a subtraction. The session is derived from
            // its start timestamp rather than read from a counter, which is exactly what makes it
            // safe here: there is no value being kept current on a timer that a tab list refreshing
            // every second could catch mid-update.
            case "afk" -> yesNo(afk.isAfk(uuid));
            case "afk_session" -> Durations.compact(afk.sessionMillis(uuid));
            case "afk_today" -> Durations.compact(afkRewards.statistics(uuid).todayMillis());
            case "afk_total" -> Durations.compact(afkRewards.statistics(uuid).totalMillis());
            // Formatted, not String.valueOf. Lifetime AFK earnings are robs, and robs carry two
            // decimal places now — the raw form rendered "1240.0" in a tab list.
            case "afk_robs" -> org.robtic.minecraft.util.Robs.format(
                    afkRewards.statistics(uuid).totalRobs());
            // Anything this expansion does not recognise is offered to the registered extensions
            // before being given up on, so a module can publish its own placeholders under the same
            // `robtic_` identifier — PlaceholderAPI allows only one expansion per identifier, and a
            // second one would mean the progression placeholders had to be spelled differently from
            // every other placeholder this plugin exposes.
            default -> fromExtensions(player, key);
        };
    }

    /**
     * Asks each registered extension in turn, returning the first answer.
     *
     * Returns null when nothing recognises the key, which PlaceholderAPI renders as the untouched
     * placeholder — the signal a config typo needs, rather than a silent empty string.
     */
    private String fromExtensions(OfflinePlayer player, String key) {
        for (Extension extension : extensions) {
            String value = extension.resolve(player, key);

            if (value != null) {
                return value;
            }
        }

        return null;
    }

    /**
     * A module's contribution to the `robtic_` placeholder namespace.
     *
     * Exists so a feature can expose placeholders without this class importing it — the same reason
     * the progression system routes attributes through a provider rather than naming its sources.
     */
    @FunctionalInterface
    public interface Extension {
        /**
         * @param key the placeholder with the `robtic_` prefix already stripped, lowercased
         * @return the value, or null if this extension does not recognise the key
         */
        String resolve(OfflinePlayer player, String key);
    }

    /** Registers an extension. Called at boot, before the expansion is registered. */
    public void extend(Extension extension) {
        extensions.add(extension);
    }

    /** Resolves `top_name_3`, `top_robs_3` and `top_robs_formatted_3`. */
    private String board(String key) {
        int split = key.lastIndexOf('_');
        if (split < 0) {
            return null;
        }

        int position;
        try {
            position = Integer.parseInt(key.substring(split + 1));
        } catch (NumberFormatException notANumber) {
            return null;
        }

        Optional<LeaderboardService.Entry> entry = leaderboard.at(position);

        return switch (key.substring(0, split)) {
            case "top_name" -> entry.map(LeaderboardService.Entry::username).orElse(UNKNOWN);
            case "top_robs" -> org.robtic.minecraft.util.Robs.format(
                    entry.map(LeaderboardService.Entry::robs).orElse(0d));
            case "top_robs_formatted" -> org.robtic.minecraft.util.Robs.format(
                    entry.map(LeaderboardService.Entry::robs).orElse(0d));
            default -> null;
        };
    }

    /**
     * The rank the player holds: their LuckPerms groups, resolved against roles.yml.
     *
     * This is the "is this player an admin?" answer, and it costs a list scan of a handful of
     * entries against groups already in memory. Discord is not consulted — it never was the
     * authority, and now it is not even the source.
     */
    private Optional<StaffRank> rank(UUID uuid) {
        return roles.highestFor(roleSync.groupsOf(uuid));
    }

    private double robs(UUID uuid) {
        return balances.get(uuid).map(BalanceCache.Balance::total).orElse(0d);
    }

    /**
     * How long this player has been in staff mode, or "-" when they are not.
     *
     * Read from the session the staff-mode service already tracks in memory — the API also records
     * one, but asking it here would be a network call inside a placeholder.
     */
    private String sessionDuration(UUID uuid) {
        return staffAvailability.sessionStartedAt(uuid)
                .map(started -> {
                    long minutes = Math.max(0, (System.currentTimeMillis() - started) / 60_000L);
                    long hours = minutes / 60;
                    return hours > 0 ? hours + "h " + (minutes % 60) + "m" : minutes + "m";
                })
                .orElse(UNKNOWN);
    }

    private static String yesNo(boolean value) {
        return value ? YES : NO;
    }
}
