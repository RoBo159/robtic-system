package org.robtic.core.placeholder;

import org.bukkit.OfflinePlayer;
import org.robtic.core.cache.BalanceCache;
import org.robtic.core.config.RoleSettings;
import org.robtic.core.model.PlayerProfile;
import org.robtic.core.model.StaffRank;
import org.robtic.core.service.LeaderboardService;
import org.robtic.core.service.PermissionSyncService;
import org.robtic.core.service.PlayerDataService;
import org.robtic.core.util.Robs;

import java.util.Optional;
import java.util.UUID;

/**
 * The placeholders Core owns: the economy, the leaderboard, account linking and rank.
 *
 * <h2>Split out of the monolith's one expansion</h2>
 *
 * That class answered thirty-three keys directly and offered the rest to extensions. Across ten
 * plugins none of them could stay in the expansion itself, because the expansion is in Core and most
 * of the answers are not. So each plugin contributes the keys it can answer, and this is Core's
 * share — everything that reads from the economy, the player profile or the role configuration.
 *
 * <h2>Everything here is a memory read</h2>
 *
 * A placeholder can be resolved several times a second by a scoreboard or a tab list, on the main
 * thread. Nothing here reaches the API: the balance comes from the cache, the profile comes from the
 * cache, the leaderboard is refreshed on a timer elsewhere. A key whose answer has not arrived reads
 * as its fallback rather than blocking.
 */
public final class CorePlaceholders implements RobticPlaceholders.Extension {

    private static final String UNKNOWN = "-";

    private final PlayerDataService players;
    private final BalanceCache balances;
    private final LeaderboardService leaderboard;
    private final PermissionSyncService permissions;
    private final RoleSettings roles;

    public CorePlaceholders(
            PlayerDataService players,
            BalanceCache balances,
            LeaderboardService leaderboard,
            PermissionSyncService permissions,
            RoleSettings roles
    ) {
        this.players = players;
        this.balances = balances;
        this.leaderboard = leaderboard;
        this.permissions = permissions;
        this.roles = roles;
    }

    @Override
    public String resolve(OfflinePlayer player, String key) {
        // Board placeholders are player-independent and are answered before the null check — a
        // leaderboard on a login screen has no player attached.
        if (key.startsWith("top_")) {
            return board(key);
        }

        if (player == null) {
            return null;
        }

        UUID uuid = player.getUniqueId();
        Optional<PlayerProfile> profile = players.cached(uuid);

        return switch (key) {
            case "robs", "robs_formatted" -> Robs.format(cachedRobs(uuid));
            case "robs_pending" -> Robs.format(
                    balances.get(uuid).map(BalanceCache.Balance::pending).orElse(0d));

            case "linked" -> yesNo(profile.map(PlayerProfile::linked).orElse(false));
            case "discord_id" -> profile.map(PlayerProfile::discordId).orElse("");

            case "rank" -> rank(uuid).map(StaffRank::displayName).orElse("Player");
            case "rank_group" -> rank(uuid).map(StaffRank::group).orElse("default");
            case "is_staff" -> yesNo(rank(uuid).isPresent());

            // From the cached profile rather than from RobticStaff's live services: this answers for
            // any account including an offline one, and Core must not depend on a staff plugin to
            // report a field the API already sent it.
            case "frozen" -> yesNo(profile.map(PlayerProfile::frozen).orElse(false));
            case "jailed" -> yesNo(profile.map(PlayerProfile::jailed).orElse(false));
            case "warnings" -> String.valueOf(profile.map(PlayerProfile::warningCount).orElse(0));

            case "position" -> leaderboard.forUuid(uuid.toString())
                    .map(entry -> String.valueOf(entry.position()))
                    .orElse(UNKNOWN);

            default -> null;
        };
    }

    /** Resolves {@code top_name_3}, {@code top_robs_3} and {@code top_robs_formatted_3}. */
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
            case "top_robs", "top_robs_formatted" -> Robs.format(
                    entry.map(LeaderboardService.Entry::robs).orElse(0d));
            default -> null;
        };
    }

    /**
     * The balance, from the cache only.
     *
     * Deliberately not {@code RobsService#balance}, which is authoritative and blocks. A tab list
     * refreshing every second must never make an HTTP request per player.
     */
    private double cachedRobs(UUID uuid) {
        // total(), not synced(): what a player is shown must include earnings that have been credited
        // locally but not yet confirmed by the API, or a payout appears to vanish until it syncs.
        return balances.get(uuid).map(BalanceCache.Balance::total).orElse(0d);
    }

    /** The rank the player holds: their LuckPerms groups, resolved against roles.yml. */
    private Optional<StaffRank> rank(UUID uuid) {
        return roles.highestFor(permissions.groupsOf(uuid));
    }

    private static String yesNo(boolean value) {
        return value ? "yes" : "no";
    }
}
