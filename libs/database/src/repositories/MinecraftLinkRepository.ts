import { MinecraftLink, type IMinecraftLink } from "@database/models/MinecraftLink";

export class MinecraftLinkRepository {
    static async getByDiscordId(guildId: string, discordId: string): Promise<IMinecraftLink | null> {
        return MinecraftLink.findOne({ guildId, discordId });
    }

    static async getByUuid(guildId: string, minecraftUuid: string): Promise<IMinecraftLink | null> {
        return MinecraftLink.findOne({ guildId, minecraftUuid: minecraftUuid.toLowerCase() });
    }

    static async create(
        guildId: string,
        discordId: string,
        minecraftUuid: string,
        minecraftUsername: string,
        linkedFromServer?: string,
    ): Promise<IMinecraftLink> {
        return MinecraftLink.create({
            guildId,
            discordId,
            minecraftUuid: minecraftUuid.toLowerCase(),
            minecraftUsername,
            linkedFromServer,
            linkedAt: new Date(),
        });
    }

    static async delete(guildId: string, discordId: string): Promise<boolean> {
        const result = await MinecraftLink.deleteOne({ guildId, discordId });
        return result.deletedCount > 0;
    }

    /** Keeps the stored username in step with a rename and records the sighting. */
    static async touch(guildId: string, minecraftUuid: string, minecraftUsername: string): Promise<void> {
        await MinecraftLink.updateOne(
            { guildId, minecraftUuid: minecraftUuid.toLowerCase() },
            { $set: { minecraftUsername, lastSeenAt: new Date() } }
        );
    }

    static async countGuild(guildId: string): Promise<number> {
        return MinecraftLink.countDocuments({ guildId });
    }
}
