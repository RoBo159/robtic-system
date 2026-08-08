import { MinecraftLink, type IMinecraftLink } from "@database/models/MinecraftLink";

export class MinecraftLinkRepository {
    static async getByDiscordId(guildId: string, discordId: string): Promise<IMinecraftLink | null> {
        return MinecraftLink.findOne({ guildId, discordId });
    }

    static async getByUuid(guildId: string, minecraftUuid: string): Promise<IMinecraftLink | null> {
        return MinecraftLink.findOne({ guildId, minecraftUuid: minecraftUuid.toLowerCase() });
    }

    /**
     * Resolves many links at once, for a caller holding a page of Discord ids — a leaderboard,
     * chiefly. One query rather than one per row, so ranking N players costs a single round trip.
     */
    static async listByDiscordIds(guildId: string, discordIds: string[]): Promise<IMinecraftLink[]> {
        if (discordIds.length === 0) return [];
        return MinecraftLink.find({ guildId, discordId: { $in: discordIds } });
    }

    /**
     * Resolves by username. Case-insensitive because Minecraft names are displayed with their
     * original casing but compared without it, and a staff member typing a name into a command
     * should not have to reproduce it exactly.
     */
    static async getByUsername(guildId: string, minecraftUsername: string): Promise<IMinecraftLink | null> {
        return MinecraftLink.findOne({
            guildId,
            minecraftUsername: new RegExp(`^${minecraftUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        });
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
