import { QuestSettings, type IQuestSettings } from "@database/models/QuestSettings";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { settings: IQuestSettings; expiresAt: number }>();

/** Read on every generation tick and every VIP eligibility check, so cached like the other hot settings. */
export class QuestSettingsRepository {
    static async getCached(guildId: string): Promise<IQuestSettings> {
        const hit = cache.get(guildId);
        if (hit && hit.expiresAt > Date.now()) return hit.settings;

        const settings = await QuestSettings.findOneAndUpdate(
            { guildId },
            { $setOnInsert: { guildId } },
            { upsert: true, returnDocument: "after" }
        ) as IQuestSettings;

        cache.set(guildId, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
        return settings;
    }

    static async setChannel(
        guildId: string,
        field: "dailyChannelId" | "communityChannelId" | "vipChannelId",
        channelId: string | null,
    ): Promise<IQuestSettings> {
        return this.update(guildId, { $set: { [field]: channelId } });
    }

    static async setMentionRole(guildId: string, tier: string, roleId: string | null): Promise<IQuestSettings> {
        return this.update(guildId, { $set: { [`mentionRoles.${tier}`]: roleId } });
    }

    static async editVipRole(guildId: string, roleId: string, action: "add" | "remove"): Promise<IQuestSettings> {
        return this.update(
            guildId,
            action === "add" ? { $addToSet: { vipRoleIds: roleId } } : { $pull: { vipRoleIds: roleId } }
        );
    }

    static async setVipRoles(guildId: string, roleIds: string[]): Promise<IQuestSettings> {
        return this.update(guildId, { $set: { vipRoleIds: roleIds } });
    }

    static async setTierEnabled(guildId: string, tier: string, enabled: boolean): Promise<IQuestSettings> {
        return this.update(guildId, { $set: { [`enabledTiers.${tier}`]: enabled } });
    }

    static async setWindows(guildId: string, windows: IQuestSettings["windows"]): Promise<IQuestSettings> {
        return this.update(guildId, { $set: { windows } });
    }

    static async setUtcOffset(guildId: string, utcOffsetMinutes: number): Promise<IQuestSettings> {
        return this.update(guildId, { $set: { utcOffsetMinutes } });
    }

    static async setCommunity(
        guildId: string,
        communityEnabled: boolean,
        communityRewardBase: number,
        communityMinContribution: number,
    ): Promise<IQuestSettings> {
        return this.update(guildId, {
            $set: { communityEnabled, communityRewardBase, communityMinContribution },
        });
    }

    /** Every write goes through here so no path can forget to drop the cache entry. */
    private static async update(guildId: string, mutation: object): Promise<IQuestSettings> {
        const settings = await QuestSettings.findOneAndUpdate(
            { guildId },
            mutation,
            { upsert: true, returnDocument: "after" }
        ) as IQuestSettings;

        cache.delete(guildId);
        return settings;
    }

    static invalidate(guildId: string): void {
        cache.delete(guildId);
    }
}
