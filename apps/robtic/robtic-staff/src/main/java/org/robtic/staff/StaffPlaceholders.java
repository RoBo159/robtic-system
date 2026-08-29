package org.robtic.staff;

import org.bukkit.OfflinePlayer;
import org.robtic.core.model.StaffRank;
import org.robtic.core.placeholder.RobticPlaceholders;


import java.util.UUID;

/**
 * The staff placeholders: availability, session, and the report counters.
 *
 * <h2>Two sources, deliberately</h2>
 *
 * Availability is answered from this server's own memory — staff mode and LuckPerms groups are both
 * local, so the answer is correct at the instant it is asked. The counters behind
 * {@code reports_*} and {@code staff_total_cases} come from the database and are refreshed on a
 * timer by {@link StaffStatsCache}, because they count things that happened on other servers too.
 *
 * <h2>What is not here</h2>
 *
 * {@code frozen}, {@code jailed}, {@code warnings}, {@code rank} and {@code is_staff} are answered
 * by Core from the cached player profile, not by this plugin. They have to work for offline accounts
 * and on servers with no staff plugin installed, and the API already sends the values on join.
 */
public final class StaffPlaceholders implements RobticPlaceholders.Extension {

    private static final String UNKNOWN = "-";

    private final StaffAvailabilityService availability;
    private final StaffStatsCache stats;

    public StaffPlaceholders(StaffAvailabilityService availability, StaffStatsCache stats) {
        this.availability = availability;
        this.stats = stats;
    }

    @Override
    public String resolve(OfflinePlayer player, String key) {
        // staff_online, staff_active and staff_available describe the server rather than a player,
        // so they are answered before the null check — a scoreboard on a login screen has no player.
        switch (key) {
            case "staff_online" -> {
                return String.valueOf(availability.onlineStaffCount());
            }
            case "staff_active" -> {
                return String.valueOf(availability.activeCount());
            }
            case "staff_available" -> {
                return yesNo(availability.anyAvailable());
            }
            case "reports_open" -> {
                return String.valueOf(stats.counts().open());
            }
            case "reports_reviewing" -> {
                return String.valueOf(stats.counts().reviewing());
            }
            case "reports_resolved" -> {
                return String.valueOf(stats.counts().resolved());
            }
            default -> {
                // Falls through to the per-player keys below.
            }
        }

        if (player == null) {
            return null;
        }

        UUID uuid = player.getUniqueId();

        return switch (key) {
            case "staff_rank" -> availability.rankOf(uuid).map(StaffRank::displayName).orElse(UNKNOWN);
            case "staff_mode" -> yesNo(availability.isInStaffMode(uuid));
            case "staff_session" -> sessionDuration(uuid);

            case "reports_claimed" -> String.valueOf(stats.of(uuid).claimed());
            case "staff_total_cases" -> String.valueOf(stats.of(uuid).handled());
            case "staff_jails" -> String.valueOf(stats.of(uuid).jails());
            case "staff_warnings" -> String.valueOf(stats.of(uuid).warnings());

            default -> null;
        };
    }

    /**
     * How long this staff member has been in {@code /admin}.
     *
     * Derived from the session's start timestamp rather than a counter kept current on a timer,
     * which is what makes it safe to read from a tab list refreshing every second: there is no value
     * mid-update to catch.
     */
    private String sessionDuration(UUID uuid) {
        return availability.sessionStartedAt(uuid)
                .map(started -> {
                    long minutes = Math.max(0, (System.currentTimeMillis() - started) / 60_000L);
                    long hours = minutes / 60;

                    return hours > 0 ? hours + "h " + (minutes % 60) + "m" : minutes + "m";
                })
                .orElse(UNKNOWN);
    }

    private static String yesNo(boolean value) {
        return value ? "yes" : "no";
    }
}
