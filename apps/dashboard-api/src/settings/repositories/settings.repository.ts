import { Injectable } from "@nestjs/common";
import {
    CommandAccessRepository,
    FeatureCatalogRepository,
    GuildFeatureRepository,
    ServerConfigRepository,
    StaffTierRepository,
} from "@database/repositories";
import type { ICommandAccess, IFeatureCatalog, IServerConfig, IStaffTier } from "@database/models";

/**
 * The only place in this module that touches the database.
 *
 * `@database/repositories` are static classes shared with the bot — `ServerConfigRepository.setPrefix(...)`
 * is a global function call, not something a service can be handed a different implementation of.
 * Wrapping them in an injectable puts a seam back: `SettingsService` depends on a constructor
 * parameter it can be given a fake for, and the five separate static classes it used to import
 * directly become one collaborator with one purpose.
 *
 * It also stops the aggregation leaking upward. Guild configuration is spread across five
 * collections; which five is this file's problem, and nothing above it needs to know.
 */
@Injectable()
export class SettingsRepository {
    /** Creates the config document if this guild has never been configured — the bot does the same. */
    findOrCreateConfig(guildId: string): Promise<IServerConfig> {
        return ServerConfigRepository.findOrCreate(guildId);
    }

    /** Only the features this guild has an explicit opinion about; the rest run on catalog defaults. */
    featureOverrides(guildId: string): Promise<Map<string, boolean>> {
        return GuildFeatureRepository.getOverrides(guildId);
    }

    /** Global, not per guild: the catalog is the set of features the bot has at all. */
    featureCatalog(): Promise<IFeatureCatalog[]> {
        return FeatureCatalogRepository.list();
    }

    staffTiers(guildId: string): Promise<IStaffTier[]> {
        return StaffTierRepository.list(guildId);
    }

    staffTier(guildId: string, key: string): Promise<IStaffTier | null> {
        return StaffTierRepository.get(guildId, key);
    }

    commandAccess(guildId: string): Promise<ICommandAccess[]> {
        return CommandAccessRepository.listForGuild(guildId);
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

    async addStaffTierRole(guildId: string, key: string, roleId: string): Promise<void> {
        await StaffTierRepository.addRole(guildId, key, roleId);
    }

    async removeStaffTierRole(guildId: string, key: string, roleId: string): Promise<void> {
        await StaffTierRepository.removeRole(guildId, key, roleId);
    }
}
