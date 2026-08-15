import { StreakSettings, type IStreakSettings } from "@database/models/StreakSettings";

export class StreakSettingsRepository {
    static async get(guildId: string): Promise<IStreakSettings | null> {
        return StreakSettings.findOne({ guildId });
    }

    static async getOrCreate(guildId: string): Promise<IStreakSettings> {
        let settings = await StreakSettings.findOne({ guildId });
        if (!settings) {
            settings = await StreakSettings.create({ guildId });
        }
        return settings;
    }

    static async isStreakChannel(guildId: string, channelId: string): Promise<boolean> {
        const settings = await StreakSettings.findOne({ guildId });
        return settings?.channels.includes(channelId) ?? false;
    }

    static async addChannel(guildId: string, channelId: string): Promise<IStreakSettings> {
        return StreakSettings.findOneAndUpdate(
            { guildId },
            { $addToSet: { channels: channelId } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IStreakSettings>;
    }

    static async removeChannel(guildId: string, channelId: string): Promise<IStreakSettings> {
        return StreakSettings.findOneAndUpdate(
            { guildId },
            { $pull: { channels: channelId } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IStreakSettings>;
    }

    /** Replaces the whole channel list at once — used by the admin config panel. */
    static async setChannels(guildId: string, channels: string[]): Promise<IStreakSettings> {
        return StreakSettings.findOneAndUpdate(
            { guildId },
            { $set: { channels } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IStreakSettings>;
    }

    static async setRemindersEnabled(guildId: string, enabled: boolean): Promise<IStreakSettings> {
        return StreakSettings.findOneAndUpdate(
            { guildId },
            { remindersEnabled: enabled },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IStreakSettings>;
    }

    static async setMinMessageLength(guildId: string, length: number): Promise<IStreakSettings> {
        return StreakSettings.findOneAndUpdate(
            { guildId },
            { minMessageLength: length },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IStreakSettings>;
    }

    /** Passing null clears it, which puts announcements back in whichever channel earned the streak. */
    static async setAnnounceChannel(guildId: string, channelId: string | null): Promise<IStreakSettings> {
        return StreakSettings.findOneAndUpdate(
            { guildId },
            channelId ? { announceChannelId: channelId } : { $unset: { announceChannelId: "" } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IStreakSettings>;
    }
}
