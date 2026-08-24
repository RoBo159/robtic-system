import { Schema, model, type Document } from "mongoose";

/**
 * A one-time code that lets a player set a new password from Discord.
 *
 * <h2>The same shape as a link code, and for the same reason</h2>
 *
 * Issued on one screen, typed into another by somebody who cannot get in. It is short, unambiguous,
 * single-use, and removed by a TTL index on {@link expiresAt} — the pattern
 * {@code MinecraftLinkCode} already established, deliberately not reinvented.
 *
 * <h2>Issued in game, redeemed on Discord</h2>
 *
 * The direction matters and it is what makes this safe without an email server. Pressing *Forgot
 * Password* on the login screen proves the person holds the Minecraft account; redeeming the code on
 * Discord proves they hold the linked Discord account. Neither alone can change a password, so a
 * stolen session on one side is not enough.
 *
 * That is also why this does not require an existing password. A player who has never set one — the
 * ordinary state for every account linked before RobticAuth — reaches a new password by the same
 * two proofs as a player who has forgotten theirs. There is no separate first-time flow to get
 * wrong, and no reason to make a legacy link re-link.
 *
 * <h2>Claimed destructively</h2>
 *
 * Redemption deletes the row and acts on what the delete returned, so two attempts on the same code
 * cannot both succeed. Single use is a property of the operation rather than a flag somebody has to
 * remember to check.
 */
export interface IMinecraftRecoveryCode extends Document {
    guildId: string;
    /** Uppercase, undashed. The dash in `D92L-X71M` is presentation, and input is normalised. */
    code: string;
    minecraftUuid: string;
    minecraftUsername: string;
    /**
     * The Discord account allowed to redeem it, captured when the code is issued.
     *
     * Checked at redemption so a code read off somebody's screen cannot be used from another Discord
     * account — without it, the second proof this design relies on would not exist.
     */
    discordId: string;
    /** Server key the player asked from, for auditing. */
    serverKey?: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftRecoveryCodeSchema = new Schema<IMinecraftRecoveryCode>(
    {
        guildId: { type: String, required: true, index: true },
        code: { type: String, required: true, unique: true, uppercase: true, trim: true },
        minecraftUuid: { type: String, required: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        discordId: { type: String, required: true, index: true },
        serverKey: { type: String, trim: true },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
);

/** Used to discard a player's outstanding code before issuing another. */
minecraftRecoveryCodeSchema.index({ guildId: 1, minecraftUuid: 1 });

minecraftRecoveryCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MinecraftRecoveryCode = model<IMinecraftRecoveryCode>(
    "MinecraftRecoveryCode",
    minecraftRecoveryCodeSchema,
);
