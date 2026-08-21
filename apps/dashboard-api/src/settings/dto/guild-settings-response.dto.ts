/**
 * `GET /guilds/:guildId/settings` — every setting the dashboard renders, in one document.
 *
 * Mirrored by `GuildSettings` in `apps/dashboard/src/lib/types.ts`.
 */

export interface FeatureStateResponse {
    key: string;
    description: string;
    commands: string[];
    enabled: boolean;
    /** False means the feature is running on its catalog default, not on a choice this guild made. */
    overridden: boolean;
}

export interface StaffTierResponse {
    key: string;
    score: number;
    roleIds: string[];
}

export interface CommandAccessResponse {
    commandName: string;
    allowedRoleIds: string[];
    allowedCategoryKeys: string[];
}

export interface GuildSettingsResponse {
    prefix: string | null;
    commandsChannelId: string | null;
    botAdminRoleIds: string[];
    features: FeatureStateResponse[];
    staffTiers: StaffTierResponse[];
    commandAccess: CommandAccessResponse[];
}
