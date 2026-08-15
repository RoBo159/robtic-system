import type { AdminConfigSnapshot } from "@typings/admin-config";
import {
    ServerConfigRepository,
    XPSettingsRepository,
    StreakSettingsRepository,
    ComboSettingsRepository,
    PunishConfigRepository,
    LogConfigRepository,
    CoinSettingsRepository,
    FeatureCatalogRepository,
    GuildFeatureRepository,
    RejoinRolesConfigRepository,
} from "@database/repositories";
import { COIN_DEFAULTS, LOG_REGISTRY, STREAK_CONFIG } from "@constants";

/** Reads every editable config section for a guild into one snapshot for the admin panel. */
export async function getAdminConfig(guildId: string): Promise<AdminConfigSnapshot> {
    const [server, xp, streak, combo, punish, logConfigs, coins, catalog, overrides, rejoin] = await Promise.all([
        ServerConfigRepository.find(guildId),
        XPSettingsRepository.get(guildId),
        StreakSettingsRepository.get(guildId),
        ComboSettingsRepository.get(guildId),
        PunishConfigRepository.findOrCreate(guildId),
        LogConfigRepository.findAll(),
        CoinSettingsRepository.get(guildId),
        FeatureCatalogRepository.list(),
        GuildFeatureRepository.getOverrides(guildId),
        RejoinRolesConfigRepository.getCached(guildId),
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
            botAdminRoles: server?.botAdminRoles ?? [],
        },
        xp: {
            chatChannels: xp?.chatChannels ?? [],
            supportChannels: xp?.supportChannels ?? [],
            staffChannels: xp?.staffChannels ?? [],
            allowedRoles: xp?.allowedRoles ?? [],
            decayEnabled: xp?.decayEnabled ?? false,
            levelUpChannelId: xp?.levelUpChannelId ?? null,
        },
        streak: {
            channels: streak?.channels ?? [],
            remindersEnabled: streak?.remindersEnabled ?? false,
            minMessageLength: streak?.minMessageLength ?? STREAK_CONFIG.minMessageLength,
            announceChannelId: streak?.announceChannelId ?? null,
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
        features: {
            // The catalog is whatever the bot last published; the override map is this guild's
            // explicit choices. Absence of an override means the feature runs on its default.
            features: catalog.map(entry => ({
                key: entry.key,
                description: entry.description,
                activation: entry.activation,
                commands: entry.commands,
                enabled: overrides.get(entry.key) ?? entry.activation === "default-on",
                overridden: overrides.has(entry.key),
            })),
        },
        rejoinRoles: {
            excludedRoleIds: rejoin.excludedRoleIds,
            staffRoleIds: rejoin.staffRoleIds,
            retentionHours: rejoin.retentionHours,
            staffRetentionHours: rejoin.staffRetentionHours,
        },
    };
}
