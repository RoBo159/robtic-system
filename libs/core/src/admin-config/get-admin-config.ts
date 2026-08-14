import type { AdminConfigSnapshot } from "@typings/admin-config";
import {
    ServerConfigRepository,
    XPSettingsRepository,
    StreakSettingsRepository,
    ComboSettingsRepository,
    PunishConfigRepository,
    LogConfigRepository,
    CoinSettingsRepository,
} from "@database/repositories";
import { COIN_DEFAULTS, LOG_REGISTRY, STREAK_CONFIG } from "@constants";

/** Reads every editable config section for a guild into one snapshot for the admin panel. */
export async function getAdminConfig(guildId: string): Promise<AdminConfigSnapshot> {
    const [server, xp, streak, combo, punish, logConfigs, coins] = await Promise.all([
        ServerConfigRepository.find(guildId),
        XPSettingsRepository.get(guildId),
        StreakSettingsRepository.get(guildId),
        ComboSettingsRepository.get(guildId),
        PunishConfigRepository.findOrCreate(guildId),
        LogConfigRepository.findAll(),
        CoinSettingsRepository.get(guildId),
    ]);

    const logChannels: Record<string, string | null> = {};
    for (const key of Object.keys(LOG_REGISTRY)) {
        // A log config is stored globally per key, but only surface the one pointing at this guild.
        const match = logConfigs.find(entry => entry.key === key && entry.serverId === guildId);
        logChannels[key] = match?.channelId ?? null;
    }

    return {
        server: {
            prefix: server?.prefix ?? null,
            commandsChannelId: server?.commandsChannelId ?? null,
            roles: {
                members: server?.roles?.members ?? null,
                bots: server?.roles?.bots ?? null,
                en: server?.roles?.en ?? null,
                ar: server?.roles?.ar ?? null,
            },
            adminPanelRoles: server?.adminPanelRoles ?? [],
        },
        xp: {
            chatChannels: xp?.chatChannels ?? [],
            supportChannels: xp?.supportChannels ?? [],
            staffChannels: xp?.staffChannels ?? [],
            allowedRoles: xp?.allowedRoles ?? [],
            decayEnabled: xp?.decayEnabled ?? false,
        },
        streak: {
            channels: streak?.channels ?? [],
            remindersEnabled: streak?.remindersEnabled ?? false,
            minMessageLength: streak?.minMessageLength ?? STREAK_CONFIG.minMessageLength,
        },
        combo: {
            championRoleId: combo?.championRoleId ?? null,
            minScorePerMessage: combo?.minScorePerMessage ?? null,
            maxScorePerMessage: combo?.maxScorePerMessage ?? null,
        },
        punish: {
            pointsPerAction: punish.pointsPerAction,
            proofChannelId: punish.proofChannelId ?? null,
            shortcutRoleIds: punish.shortcutRoleIds ?? [],
        },
        logs: {
            channels: logChannels,
        },
        coins: {
            messagesPerCoin: coins?.messagesPerCoin ?? COIN_DEFAULTS.messagesPerCoin,
            comboPerCoin: coins?.comboPerCoin ?? COIN_DEFAULTS.comboPerCoin,
            streakRewards: (coins?.streakRewards ?? []).map(r => ({ streak: r.streak, coins: r.coins })),
        },
    };
}
