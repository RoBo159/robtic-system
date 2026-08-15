import { VoiceSettings, type IVoiceSettings } from "@database/models";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { settings: IVoiceSettings; expiresAt: number }>();

export class VoiceSettingsRepository {
    /** Read once per tick per guild, so cached with the usual short TTL. */
    static async getCached(guildId: string): Promise<IVoiceSettings> {
        const hit = cache.get(guildId);
        if (hit && hit.expiresAt > Date.now()) return hit.settings;

        const settings = await VoiceSettings.findOneAndUpdate(
            { guildId },
            { $setOnInsert: { guildId } },
            { upsert: true, returnDocument: "after" }
        ) as IVoiceSettings;

        cache.set(guildId, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
        return settings;
    }

    static async update(guildId: string, mutation: object): Promise<IVoiceSettings> {
        const settings = await VoiceSettings.findOneAndUpdate(
            { guildId },
            mutation,
            { upsert: true, returnDocument: "after" }
        ) as IVoiceSettings;

        cache.delete(guildId);
        return settings;
    }

    static async editChannel(guildId: string, field: "trackedChannelIds" | "excludedChannelIds", channelId: string, action: "add" | "remove"): Promise<IVoiceSettings> {
        return this.update(guildId, action === "add" ? { $addToSet: { [field]: channelId } } : { $pull: { [field]: channelId } });
    }

    static async editRole(guildId: string, roleId: string, action: "add" | "remove"): Promise<IVoiceSettings> {
        return this.update(guildId, action === "add" ? { $addToSet: { allowedRoleIds: roleId } } : { $pull: { allowedRoleIds: roleId } });
    }

    static invalidate(guildId: string): void {
        cache.delete(guildId);
    }
}
