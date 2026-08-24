import {
    MinecraftRecoveryCode,
    type IMinecraftRecoveryCode,
} from "@database/models/MinecraftRecoveryCode";

/**
 * Password-recovery codes.
 *
 * Modelled on {@code MinecraftLinkCodeRepository}: issue discards any outstanding code, and
 * redemption is a destructive claim rather than a read followed by a delete. Two people racing the
 * same code therefore cannot both succeed — the loser is told the code is unknown, which is also the
 * honest answer.
 */
export class MinecraftRecoveryCodeRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    /** Strips the display grouping, so `D92L-X71M` and `d92lx71m` are the same code. */
    static normalise(code: string): string {
        return code.replace(/[\s-]/g, "").toUpperCase();
    }

    /**
     * Issues a code, replacing any the player already had.
     *
     * Replacing rather than accumulating: a player who presses *Forgot Password* three times has
     * three codes on screen and remembers the last one, and leaving the earlier two live would widen
     * the window for no benefit.
     */
    static async issue(input: {
        guildId: string;
        code: string;
        minecraftUuid: string;
        minecraftUsername: string;
        discordId: string;
        serverKey?: string;
        expiresAt: Date;
    }): Promise<IMinecraftRecoveryCode> {
        const minecraftUuid = this.key(input.minecraftUuid);

        await MinecraftRecoveryCode.deleteMany({ guildId: input.guildId, minecraftUuid });

        return MinecraftRecoveryCode.create({
            guildId: input.guildId,
            code: this.normalise(input.code),
            minecraftUuid,
            minecraftUsername: input.minecraftUsername,
            discordId: input.discordId,
            serverKey: input.serverKey,
            expiresAt: input.expiresAt,
        });
    }

    /**
     * Claims a code for one Discord account, destructively.
     *
     * The `discordId` is part of the match, not checked afterwards: a code that belongs to somebody
     * else must not be consumed by the attempt, or reading a code off a stream would let a stranger
     * burn it. An unexpired match is deleted and returned; anything else returns null.
     */
    static async claim(
        guildId: string,
        code: string,
        discordId: string,
    ): Promise<IMinecraftRecoveryCode | null> {
        return MinecraftRecoveryCode.findOneAndDelete({
            guildId,
            code: this.normalise(code),
            discordId,
            expiresAt: { $gt: new Date() },
        });
    }

    /** Discards a player's outstanding code, for an unlink or an admin reset. */
    static async discard(guildId: string, minecraftUuid: string): Promise<void> {
        await MinecraftRecoveryCode.deleteMany({ guildId, minecraftUuid: this.key(minecraftUuid) });
    }
}
