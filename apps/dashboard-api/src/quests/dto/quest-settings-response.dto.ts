/** `GET /guilds/:guildId/quests/settings`. Mirrored by `QuestSettings` in the dashboard's types.ts. */
export interface QuestWindowResponse {
    key: string;
    startHour: number;
    endHour: number;
    enabled: boolean;
}

export interface QuestSettingsResponse {
    questChannelId: string | null;
    communityChannelId: string | null;
    mentionRoles: Record<string, string | null>;
    vipRoleIds: string[];
    enabledTiers: Record<string, boolean>;
    windows: QuestWindowResponse[];
    utcOffsetMinutes: number;
    community: {
        enabled: boolean;
        rewardBase: number;
        minContribution: number;
    };
}
