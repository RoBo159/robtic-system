import { MinecraftLinkCode, type IMinecraftLinkCode } from "@database/models/MinecraftLinkCode";

export class MinecraftLinkCodeRepository {
    /** Replaces any outstanding code for the same player, so only the newest one works. */
    static async issue(
        guildId: string,
        code: string,
        minecraftUuid: string,
        minecraftUsername: string,
        serverKey: string,
        expiresAt: Date,
    ): Promise<IMinecraftLinkCode> {
        const uuid = minecraftUuid.toLowerCase();
        await MinecraftLinkCode.deleteMany({ guildId, minecraftUuid: uuid });
        return MinecraftLinkCode.create({
            guildId,
            code: code.toUpperCase(),
            minecraftUuid: uuid,
            minecraftUsername,
            serverKey,
            expiresAt,
        });
    }

    /**
     * Atomically claims a code so it can only ever be redeemed once, even if two `/minecraft link`
     * calls race. Returns null when the code is unknown or already expired.
     */
    static async claim(guildId: string, code: string): Promise<IMinecraftLinkCode | null> {
        return MinecraftLinkCode.findOneAndDelete({
            guildId,
            code: code.toUpperCase(),
            expiresAt: { $gt: new Date() },
        });
    }

    static async exists(code: string): Promise<boolean> {
        return (await MinecraftLinkCode.countDocuments({ code: code.toUpperCase() })) > 0;
    }
}
