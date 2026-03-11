import { XPSettings, type IXPSettings } from "@database/models/XPSettings";

export class XPSettingsRepository {
    static async get(guildId: string): Promise<IXPSettings | null> {
        return XPSettings.findOne({ guildId });
    }

    static async getOrCreate(guildId: string): Promise<IXPSettings> {
        let settings = await XPSettings.findOne({ guildId });
        if (!settings) {
            settings = await XPSettings.create({ guildId });
        }
        return settings;
    }

    static async setChatChannels(guildId: string, channels: string[]): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { chatChannels: channels },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async setSupportChannels(guildId: string, channels: string[]): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { supportChannels: channels },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async setStaffChannels(guildId: string, channels: string[]): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { staffChannels: channels },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async setAllowedRoles(guildId: string, roles: string[]): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { allowedRoles: roles },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async setDecayEnabled(guildId: string, enabled: boolean): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { decayEnabled: enabled },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async addChatChannel(guildId: string, channelId: string): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { $addToSet: { chatChannels: channelId } },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async removeChatChannel(guildId: string, channelId: string): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { $pull: { chatChannels: channelId } },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async addSupportChannel(guildId: string, channelId: string): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { $addToSet: { supportChannels: channelId } },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async removeSupportChannel(guildId: string, channelId: string): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { $pull: { supportChannels: channelId } },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async addStaffChannel(guildId: string, channelId: string): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { $addToSet: { staffChannels: channelId } },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async removeStaffChannel(guildId: string, channelId: string): Promise<IXPSettings> {
        return XPSettings.findOneAndUpdate(
            { guildId },
            { $pull: { staffChannels: channelId } },
            { upsert: true, returnDocument: "after" }
        );
    }
}
