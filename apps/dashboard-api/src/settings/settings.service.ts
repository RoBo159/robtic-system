import { Injectable } from "@nestjs/common";
import {
    ServerConfigRepository,
    GuildFeatureRepository,
    FeatureCatalogRepository,
    StaffTierRepository,
    CommandAccessRepository,
} from "@database/repositories";

export interface GuildSettings {
    prefix: string | null;
    commandsChannelId: string | null;
    botAdminRoleIds: string[];
    features: Array<{
        key: string;
        description: string;
        commands: string[];
        enabled: boolean;
        /** False means the feature is running on its catalog default, not on a choice this guild made. */
        overridden: boolean;
    }>;
    staffTiers: Array<{ key: string; score: number; roleIds: string[] }>;
    commandAccess: Array<{ commandName: string; allowedRoleIds: string[]; allowedCategoryKeys: string[] }>;
}

/**
 * Guild configuration, as one document.
 *
 * The dashboard's job is to make the settings that are currently spread across a dozen slash
 * commands visible at once, so the read is deliberately a single aggregate rather than an endpoint
 * per repository — a settings page that has to make eleven requests before it can render is the
 * thing this replaces.
 *
 * Writes stay granular, because they are what the audit trail is built from and "the whole object
 * changed" is not something anyone can review.
 */
@Injectable()
export class SettingsService {
    async read(guildId: string): Promise<GuildSettings> {
        const [config, overrides, catalog, tiers, access] = await Promise.all([
            ServerConfigRepository.findOrCreate(guildId),
            GuildFeatureRepository.getOverrides(guildId),
            FeatureCatalogRepository.list(),
            StaffTierRepository.list(guildId),
            CommandAccessRepository.listForGuild(guildId),
        ]);

        return {
            prefix: config.prefix ?? null,
            commandsChannelId: config.commandsChannelId ?? null,
            botAdminRoleIds: config.botAdminRoles ?? [],
            features: catalog.map(entry => ({
                key: entry.key,
                description: entry.description,
                commands: entry.commands,
                // Mirrors isFeatureEnabled: the guild's explicit choice, else the catalog default.
                // The two are shown apart because "on because nobody has touched it" and "on because
                // somebody turned it on" behave alike today and diverge the moment a default changes.
                enabled: overrides.get(entry.key) ?? entry.activation === "default-on",
                overridden: overrides.has(entry.key),
            })),
            staffTiers: tiers
                .map(tier => ({ key: tier.key, score: tier.score, roleIds: tier.roleIds }))
                .sort((a, b) => b.score - a.score),
            commandAccess: access.map(entry => ({
                commandName: entry.commandName,
                allowedRoleIds: entry.allowedRoleIds,
                allowedCategoryKeys: entry.allowedCategoryKeys,
            })),
        };
    }

    async setPrefix(guildId: string, prefix: string): Promise<void> {
        await ServerConfigRepository.setPrefix(guildId, prefix);
    }

    async setCommandsChannel(guildId: string, channelId: string): Promise<void> {
        await ServerConfigRepository.setCommandsChannel(guildId, channelId);
    }

    async setBotAdminRoles(guildId: string, roleIds: string[]): Promise<void> {
        await ServerConfigRepository.setBotAdminRoles(guildId, roleIds);
    }

    async setFeature(guildId: string, key: string, enabled: boolean, actorId: string): Promise<void> {
        await GuildFeatureRepository.set(guildId, key, enabled, actorId);
    }

    async setStaffTierRoles(guildId: string, key: string, roleIds: string[]): Promise<void> {
        const tier = await StaffTierRepository.get(guildId, key);
        if (!tier) return;

        // No bulk setter on the repository, and adding one for the dashboard alone would give the
        // bot a second way to write the same field. Diffing keeps one writer.
        for (const roleId of roleIds.filter(id => !tier.roleIds.includes(id))) {
            await StaffTierRepository.addRole(guildId, key, roleId);
        }
        for (const roleId of tier.roleIds.filter(id => !roleIds.includes(id))) {
            await StaffTierRepository.removeRole(guildId, key, roleId);
        }
    }
}
