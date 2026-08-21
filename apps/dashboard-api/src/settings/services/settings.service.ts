import { Injectable } from "@nestjs/common";
import type { GuildSettingsResponse } from "../dto";
import { SettingsRepository } from "../repositories";

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
    constructor(private readonly repository: SettingsRepository) {}

    async read(guildId: string): Promise<GuildSettingsResponse> {
        const [config, overrides, catalog, tiers, access] = await Promise.all([
            this.repository.findOrCreateConfig(guildId),
            this.repository.featureOverrides(guildId),
            this.repository.featureCatalog(),
            this.repository.staffTiers(guildId),
            this.repository.commandAccess(guildId),
        ]);

        return {
            prefix: config.prefix ?? null,
            commandsChannelId: config.commandsChannelId ?? null,
            botAdminRoleIds: config.botAdminRoles ?? [],
            features: catalog.map(entry => ({
                key: entry.key,
                description: entry.description,
                commands: entry.commands,
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

    setPrefix(guildId: string, prefix: string): Promise<void> {
        return this.repository.setPrefix(guildId, prefix);
    }

    setCommandsChannel(guildId: string, channelId: string): Promise<void> {
        return this.repository.setCommandsChannel(guildId, channelId);
    }

    setBotAdminRoles(guildId: string, roleIds: string[]): Promise<void> {
        return this.repository.setBotAdminRoles(guildId, roleIds);
    }

    /**
     * `actorId` is the visitor rather than a literal "dashboard", so `/feature list` still answers
     * who turned something off.
     */
    setFeature(guildId: string, key: string, enabled: boolean, actorId: string): Promise<void> {
        return this.repository.setFeature(guildId, key, enabled, actorId);
    }

    /**
     * Replaces a staff tier's roles by diffing against what is stored.
     *
     * There is no bulk setter on the underlying repository, and adding one for the dashboard alone
     * would give the bot a second way to write the same field. Diffing keeps one writer.
     *
     * A tier that does not exist is a silent no-op, which is the pre-existing behaviour: the tier
     * list the browser is choosing from comes from `read()` above, so a missing key means the page
     * is stale rather than that the caller did something wrong.
     */
    async setStaffTierRoles(guildId: string, key: string, roleIds: string[]): Promise<void> {
        const tier = await this.repository.staffTier(guildId, key);
        if (!tier) return;

        const added = roleIds.filter(id => !tier.roleIds.includes(id));
        const removed = tier.roleIds.filter(id => !roleIds.includes(id));

        for (const roleId of added) {
            await this.repository.addStaffTierRole(guildId, key, roleId);
        }
        for (const roleId of removed) {
            await this.repository.removeStaffTierRole(guildId, key, roleId);
        }
    }
}
