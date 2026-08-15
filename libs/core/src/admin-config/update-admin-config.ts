import type { AdminConfigSection, AdminConfigUpdate } from "@typings/admin-config";
import {
    ServerConfigRepository,
    XPSettingsRepository,
    StreakSettingsRepository,
    ComboSettingsRepository,
    PunishConfigRepository,
    LogConfigRepository,
    PointSettingsRepository,
    VoiceSettingsRepository,
    FeatureCatalogRepository,
    GuildFeatureRepository,
    RejoinRolesConfigRepository,
} from "@database/repositories";
import {
    LOG_REGISTRY, ADMIN_CONFIG_LIMITS, SERVER_ROLE_SLOTS, POINT_RATE_LIMITS, RC_RATE_LIMITS,
    POINT_STREAK_REWARDS_MAX, VOICE_LIMITS, REJOIN_ROLES_LIMITS, type LogKey,
} from "@constants";

const clampInt = (value: number, { min, max }: { min: number; max: number }): number =>
    Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));

/** As clampInt, but for the fractional settings where rounding would destroy the value. */
const clampFloat = (value: number, { min, max }: { min: number; max: number }): number =>
    Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const cleanIds = (ids: unknown, cap: number): string[] => {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.filter((id): id is string => typeof id === "string" && /^\d{15,25}$/.test(id)))].slice(0, cap);
};

const idOrEmpty = (value: unknown): string => (typeof value === "string" && /^\d{15,25}$/.test(value) ? value : "");

/** REJOIN_ROLES_LIMITS in the shape clampInt expects. */
const REJOIN_HOUR_BOUNDS = { min: REJOIN_ROLES_LIMITS.minHours, max: REJOIN_ROLES_LIMITS.maxHours };

/**
 * Applies one validated config section for a guild. Every value is re-validated here (never trusted
 * from the client) so the admin panel can't write malformed ids or out-of-range numbers.
 */
export async function updateAdminConfig<S extends AdminConfigSection>(
    guildId: string,
    section: S,
    values: AdminConfigUpdate[S],
    actorId: string,
): Promise<void> {
    switch (section) {
        case "server": {
            const v = values as AdminConfigUpdate["server"];
            if (typeof v.prefix === "string" && v.prefix.trim()) {
                await ServerConfigRepository.setPrefix(guildId, v.prefix.trim().slice(0, 5));
            }
            await ServerConfigRepository.setCommandsChannel(guildId, idOrEmpty(v.commandsChannelId));
            for (const slot of SERVER_ROLE_SLOTS) {
                await ServerConfigRepository.setRole(guildId, slot, idOrEmpty(v.roles?.[slot]));
            }
            await ServerConfigRepository.setAdminPanelRoles(guildId, cleanIds(v.adminPanelRoles, ADMIN_CONFIG_LIMITS.maxChannelsPerField));
            await ServerConfigRepository.setBotAdminRoles(guildId, cleanIds(v.botAdminRoles, ADMIN_CONFIG_LIMITS.maxRolesPerField));
            return;
        }

        case "xp": {
            const v = values as AdminConfigUpdate["xp"];
            const cap = ADMIN_CONFIG_LIMITS.maxChannelsPerField;
            await XPSettingsRepository.setChatChannels(guildId, cleanIds(v.chatChannels, cap));
            await XPSettingsRepository.setSupportChannels(guildId, cleanIds(v.supportChannels, cap));
            await XPSettingsRepository.setStaffChannels(guildId, cleanIds(v.staffChannels, cap));
            await XPSettingsRepository.setAllowedRoles(guildId, cleanIds(v.allowedRoles, ADMIN_CONFIG_LIMITS.maxRolesPerField));
            await XPSettingsRepository.setDecayEnabled(guildId, Boolean(v.decayEnabled));
            await XPSettingsRepository.setLevelUpChannel(guildId, idOrEmpty(v.levelUpChannelId) || null);
            return;
        }

        case "streak": {
            const v = values as AdminConfigUpdate["streak"];
            await StreakSettingsRepository.setChannels(guildId, cleanIds(v.channels, ADMIN_CONFIG_LIMITS.maxChannelsPerField));
            await StreakSettingsRepository.setRemindersEnabled(guildId, Boolean(v.remindersEnabled));
            await StreakSettingsRepository.setMinMessageLength(guildId, clampInt(v.minMessageLength, ADMIN_CONFIG_LIMITS.streakMinMessageLength));
            await StreakSettingsRepository.setAnnounceChannel(guildId, idOrEmpty(v.announceChannelId) || null);
            return;
        }

        case "combo": {
            const v = values as AdminConfigUpdate["combo"];
            await ComboSettingsRepository.setChampionRole(guildId, idOrEmpty(v.championRoleId) || null);

            const hasRange = v.minScorePerMessage != null && v.maxScorePerMessage != null;
            if (hasRange) {
                const min = clampInt(v.minScorePerMessage!, ADMIN_CONFIG_LIMITS.comboScorePerMessage);
                const max = clampInt(v.maxScorePerMessage!, ADMIN_CONFIG_LIMITS.comboScorePerMessage);
                await ComboSettingsRepository.setScoreRange(guildId, Math.min(min, max), Math.max(min, max));
            } else {
                await ComboSettingsRepository.setScoreRange(guildId, null, null);
            }
            return;
        }

        case "punish": {
            const v = values as AdminConfigUpdate["punish"];
            await PunishConfigRepository.setPointsPerAction(guildId, clampInt(v.pointsPerAction, ADMIN_CONFIG_LIMITS.punishPointsPerAction));
            await PunishConfigRepository.setProofChannel(guildId, idOrEmpty(v.proofChannelId));
            await PunishConfigRepository.setShortcutRoles(guildId, cleanIds(v.shortcutRoleIds, ADMIN_CONFIG_LIMITS.maxRolesPerField));
            return;
        }

        case "points": {
            const v = values as AdminConfigUpdate["points"];
            await PointSettingsRepository.setRates(
                guildId,
                clampInt(v.messagesPerPoint, POINT_RATE_LIMITS),
                clampInt(v.comboPerPoint, POINT_RATE_LIMITS),
                clampInt(v.voiceMinutesPerPoint, POINT_RATE_LIMITS),
            );
            const cleaned = Array.isArray(v.streakRewards)
                ? v.streakRewards
                    .filter(r => Number.isFinite(r?.streak) && Number.isFinite(r?.points))
                    .map(r => ({
                        streak: clampInt(r.streak, { min: 1, max: 10000 }),
                        points: clampInt(r.points, { min: 1, max: 10000 }),
                    }))
                : [];
            // One payout per day-count — last entry for a duplicate streak wins.
            const rewards = [...new Map(cleaned.map(r => [r.streak, r])).values()]
                .sort((a, b) => a.streak - b.streak)
                .slice(0, POINT_STREAK_REWARDS_MAX);
            await PointSettingsRepository.setStreakRewards(guildId, rewards);
            await PointSettingsRepository.setConversion(
                guildId,
                clampInt(v.pointsPerRc, RC_RATE_LIMITS),
                Boolean(v.conversionEnabled),
                clampInt(v.minConversionPoints, RC_RATE_LIMITS),
            );
            return;
        }

        case "voice": {
            const v = values as AdminConfigUpdate["voice"];
            await VoiceSettingsRepository.update(guildId, {
                $set: {
                    enabled: Boolean(v.enabled),
                    trackedChannelIds: cleanIds(v.trackedChannelIds, ADMIN_CONFIG_LIMITS.maxChannelsPerField),
                    excludedChannelIds: cleanIds(v.excludedChannelIds, ADMIN_CONFIG_LIMITS.maxChannelsPerField),
                    allowedRoleIds: cleanIds(v.allowedRoleIds, ADMIN_CONFIG_LIMITS.maxRolesPerField),
                    // A fraction, not an integer — clampInt would round 0.25 away.
                    aloneMultiplier: clampFloat(v.aloneMultiplier, VOICE_LIMITS.aloneMultiplier),
                    afkTimeoutMinutes: clampInt(v.afkTimeoutMinutes, VOICE_LIMITS.afkTimeoutMinutes),
                    minMembersForFullRate: clampInt(v.minMembersForFullRate, VOICE_LIMITS.minMembersForFullRate),
                },
            });
            return;
        }

        case "features": {
            const v = values as AdminConfigUpdate["features"];
            const known = new Set((await FeatureCatalogRepository.list()).map(entry => entry.key));

            // Only keys the running bot actually published. A stale panel could otherwise write
            // rows for features that no longer exist, which nothing would ever clean up.
            for (const [key, enabled] of Object.entries(v.states ?? {})) {
                if (!known.has(key)) continue;
                await GuildFeatureRepository.set(guildId, key, Boolean(enabled), actorId);
            }
            return;
        }

        case "rejoinRoles": {
            const v = values as AdminConfigUpdate["rejoinRoles"];
            const cap = ADMIN_CONFIG_LIMITS.maxRolesPerField;

            const current = await RejoinRolesConfigRepository.getCached(guildId);
            const memberHours = clampInt(v.retentionHours, REJOIN_HOUR_BOUNDS);
            const staffHours = clampInt(v.staffRetentionHours, REJOIN_HOUR_BOUNDS);

            await RejoinRolesConfigRepository.replaceRoles(
                guildId,
                cleanIds(v.excludedRoleIds, cap),
                cleanIds(v.staffRoleIds, cap),
            );

            // The staff window has to stay the shorter of the two. Rather than reject the whole
            // write, keep the previous pair — the panel shows the unchanged values back.
            if (staffHours < memberHours) {
                await RejoinRolesConfigRepository.setWindows(guildId, memberHours, staffHours);
            } else {
                await RejoinRolesConfigRepository.setWindows(guildId, current.retentionHours, current.staffRetentionHours);
            }
            return;
        }

        case "logs": {
            const v = values as AdminConfigUpdate["logs"];
            for (const key of Object.keys(LOG_REGISTRY) as LogKey[]) {
                const channelId = idOrEmpty(v.channels?.[key]);
                if (channelId) {
                    await LogConfigRepository.upsert(key, guildId, channelId, actorId);
                } else {
                    const existing = await LogConfigRepository.findByKey(key);
                    if (existing?.serverId === guildId) await LogConfigRepository.deleteByKey(key);
                }
            }
            return;
        }
    }
}
