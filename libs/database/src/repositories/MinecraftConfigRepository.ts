import { MinecraftConfig, type IMinecraftConfig, type IMinecraftRoleMapping } from "@database/models/MinecraftConfig";

export class MinecraftConfigRepository {
    static async get(guildId: string): Promise<IMinecraftConfig | null> {
        return MinecraftConfig.findOne({ guildId });
    }

    static async getOrCreate(guildId: string): Promise<IMinecraftConfig> {
        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            { $setOnInsert: { guildId } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    static async setStatusChannel(guildId: string, channelId: string | null): Promise<IMinecraftConfig> {
        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            channelId ? { $set: { statusChannelId: channelId } } : { $unset: { statusChannelId: "" } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    static async setChatChannel(guildId: string, channelId: string | null): Promise<IMinecraftConfig> {
        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            channelId ? { $set: { chatChannelId: channelId } } : { $unset: { chatChannelId: "" } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    static async setToggles(
        guildId: string,
        toggles: Partial<Pick<IMinecraftConfig, "chatBridgeEnabled" | "roleSyncEnabled">>,
    ): Promise<IMinecraftConfig> {
        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            { $set: toggles },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    /** Adds or re-points a role mapping; one Discord role maps to exactly one group. */
    static async setRoleMapping(guildId: string, roleId: string, group: string): Promise<IMinecraftConfig> {
        await MinecraftConfig.updateOne(
            { guildId },
            { $pull: { roleMappings: { roleId } } },
            { upsert: true }
        );

        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            { $push: { roleMappings: { roleId, group: group.toLowerCase() } } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    static async removeRoleMapping(guildId: string, roleId: string): Promise<IMinecraftConfig> {
        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            { $pull: { roleMappings: { roleId } } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    static async setStaffChatChannel(guildId: string, channelId: string): Promise<IMinecraftConfig> {
        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            { $set: { staffChatChannelId: channelId } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    static async setDefaultLogChannel(guildId: string, channelId: string): Promise<IMinecraftConfig> {
        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            { $set: { defaultLogChannelId: channelId } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    /** Points one action at its own channel, overriding the guild default for that action alone. */
    static async setLogTarget(guildId: string, action: string, channelId: string): Promise<IMinecraftConfig> {
        await MinecraftConfig.updateOne(
            { guildId },
            { $pull: { logTargets: { action } } },
            { upsert: true }
        );

        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            { $push: { logTargets: { action, channelId, enabled: true } } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    /** Adds or re-points a staff rank; one Discord role maps to exactly one rank. */
    static async setStaffRank(
        guildId: string,
        rank: { roleId: string; name: string; group: string; priority: number },
    ): Promise<IMinecraftConfig> {
        await MinecraftConfig.updateOne(
            { guildId },
            { $pull: { staffRanks: { roleId: rank.roleId } } },
            { upsert: true }
        );

        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            { $push: { staffRanks: rank } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    static async setJailRole(guildId: string, roleId: string): Promise<IMinecraftConfig> {
        return MinecraftConfig.findOneAndUpdate(
            { guildId },
            { $set: { jailRoleId: roleId } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftConfig>;
    }

    static async getRoleMappings(guildId: string): Promise<IMinecraftRoleMapping[]> {
        const config = await MinecraftConfig.findOne({ guildId }).select("roleMappings");
        return config?.roleMappings ?? [];
    }
}
