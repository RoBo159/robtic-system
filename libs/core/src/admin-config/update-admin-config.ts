import type { AdminConfigSection, AdminConfigUpdate } from "@typings/admin-config";
import {
    ServerConfigRepository,
    XPSettingsRepository,
    StreakSettingsRepository,
    ComboSettingsRepository,
    PunishConfigRepository,
    LogConfigRepository,
    CoinSettingsRepository,
} from "@database/repositories";
import {
    LOG_REGISTRY, ADMIN_CONFIG_LIMITS, SERVER_ROLE_SLOTS,
    COIN_RATE_LIMITS, COIN_STREAK_REWARDS_MAX, type LogKey,
} from "@constants";

const clampInt = (value: number, { min, max }: { min: number; max: number }): number =>
    Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));

const cleanIds = (ids: unknown, cap: number): string[] => {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.filter((id): id is string => typeof id === "string" && /^\d{15,25}$/.test(id)))].slice(0, cap);
};

const idOrEmpty = (value: unknown): string => (typeof value === "string" && /^\d{15,25}$/.test(value) ? value : "");

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
            return;
        }

        case "streak": {
            const v = values as AdminConfigUpdate["streak"];
            await StreakSettingsRepository.setChannels(guildId, cleanIds(v.channels, ADMIN_CONFIG_LIMITS.maxChannelsPerField));
            await StreakSettingsRepository.setRemindersEnabled(guildId, Boolean(v.remindersEnabled));
            await StreakSettingsRepository.setMinMessageLength(guildId, clampInt(v.minMessageLength, ADMIN_CONFIG_LIMITS.streakMinMessageLength));
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

        case "coins": {
            const v = values as AdminConfigUpdate["coins"];
            await CoinSettingsRepository.setRates(
                guildId,
                clampInt(v.messagesPerCoin, COIN_RATE_LIMITS),
                clampInt(v.comboPerCoin, COIN_RATE_LIMITS),
            );
            const cleaned = Array.isArray(v.streakRewards)
                ? v.streakRewards
                    .filter(r => Number.isFinite(r?.streak) && Number.isFinite(r?.coins))
                    .map(r => ({
                        streak: clampInt(r.streak, { min: 1, max: 10000 }),
                        coins: clampInt(r.coins, { min: 1, max: 10000 }),
                    }))
                : [];
            // One payout per day-count — last entry for a duplicate streak wins.
            const rewards = [...new Map(cleaned.map(r => [r.streak, r])).values()]
                .sort((a, b) => a.streak - b.streak)
                .slice(0, COIN_STREAK_REWARDS_MAX);
            await CoinSettingsRepository.setStreakRewards(guildId, rewards);
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
