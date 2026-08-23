import { normaliseUuid, STAFF_STAT_KEYS, type StaffDashboardResponse, type StaffStatsResponse } from "@sdk";
import {
    MinecraftFreezeRepository,
    MinecraftJailRepository,
    MinecraftModerationRepository,
    MinecraftServerRepository,
    StaffSessionRepository,
    StaffStatsRepository,
} from "@database/repositories";
import { ModerationService } from "./moderation-service";

/**
 * Staff analytics and the live dashboard.
 *
 * The counters are read from the rolled-up `staffstats` rows rather than aggregated over the audit
 * log on each request: the log is append-only and unbounded, so aggregating it would get slower
 * every day the network runs.
 */
export class AnalyticsService {
    static async stats(guildId: string, uuid: string): Promise<StaffStatsResponse> {
        const normalised = normaliseUuid(uuid);
        const record = await StaffStatsRepository.get(guildId, normalised);

        const counters = Object.fromEntries(
            STAFF_STAT_KEYS.map(key => [key, (record?.[key] as number | undefined) ?? 0]),
        ) as StaffStatsResponse["counters"];

        const sessionCount = record?.sessionCount ?? 0;
        const onDutyMs = record?.onDutyMs ?? 0;

        return {
            uuid: normalised,
            username: record?.minecraftUsername ?? "unknown",
            onDutyMs,
            sessionCount,
            averageSessionMs: sessionCount > 0 ? Math.round(onDutyMs / sessionCount) : 0,
            lastLoginAt: record?.lastLoginAt?.toISOString() ?? null,
            counters,
        };
    }

    static async leaderboard(guildId: string, limit: number, offset: number) {
        const [rows, total] = await Promise.all([
            StaffStatsRepository.leaderboard(guildId, limit, offset),
            StaffStatsRepository.count(guildId),
        ]);

        return {
            items: rows.map(record => {
                const counters = Object.fromEntries(
                    STAFF_STAT_KEYS.map(key => [key, (record[key] as number | undefined) ?? 0]),
                ) as StaffStatsResponse["counters"];

                return {
                    uuid: record.minecraftUuid,
                    username: record.minecraftUsername,
                    onDutyMs: record.onDutyMs,
                    sessionCount: record.sessionCount,
                    averageSessionMs:
                        record.sessionCount > 0 ? Math.round(record.onDutyMs / record.sessionCount) : 0,
                    lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
                    counters,
                };
            }),
            total,
            limit,
            offset,
        };
    }

    /** The `/staff` dashboard, assembled from live state across every server in the guild. */
    static async dashboard(guildId: string, serverId?: string): Promise<StaffDashboardResponse> {
        const [sessions, frozen, jailed, reports, punishments, servers] = await Promise.all([
            StaffSessionRepository.listActive(guildId, serverId),
            MinecraftFreezeRepository.listActive(guildId),
            MinecraftJailRepository.listActive(guildId),
            MinecraftModerationRepository.listReports(guildId, "open", 25),
            MinecraftJailRepository.recent(guildId, 10),
            MinecraftServerRepository.list(guildId),
        ]);

        const playersOnline = servers
            .filter(server => server.status === "ONLINE")
            .reduce((total, server) => total + server.onlinePlayers, 0);

        return {
            onlineStaff: sessions.map(session => ({
                uuid: session.minecraftUuid,
                username: session.minecraftUsername,
                rankName: session.rankName,
                inStaffMode: true,
            })),
            playersOnline,
            frozenPlayers: frozen.map(record => ({
                uuid: record.minecraftUuid,
                username: record.minecraftUsername,
            })),
            jailedPlayers: jailed.map(record => ({
                uuid: record.minecraftUuid,
                username: record.minecraftUsername,
                remainingMs: record.releaseAt ? Math.max(0, record.releaseAt.getTime() - Date.now()) : null,
            })),
            // Mapped through the one DTO builder rather than repeating its shape here — the second
            // copy is what went stale when `reviewing` and the assignment fields were added.
            pendingReports: reports.map(report => ModerationService.toReportDto(report)),
            recentPunishments: punishments.map(record => ({
                reason: record.reason,
                moderatorUsername: record.moderatorUsername,
                durationMs: record.durationMs,
                jailedAt: record.jailedAt.toISOString(),
                releasedAt: record.releasedAt?.toISOString() ?? null,
                releasedBy: record.releasedByUsername ?? null,
                serverId: record.serverId,
            })),
        };
    }
}
