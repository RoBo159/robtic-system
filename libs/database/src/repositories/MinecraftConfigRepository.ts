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

    static async getRoleMappings(guildId: string): Promise<IMinecraftRoleMapping[]> {
        const config = await MinecraftConfig.findOne({ guildId }).select("roleMappings");
        return config?.roleMappings ?? [];
    }
}
