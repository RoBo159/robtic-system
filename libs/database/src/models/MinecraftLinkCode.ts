import { Schema, model, type Document } from "mongoose";

/**
 * A one-time code issued in-game by `/link` and redeemed on Discord by `/minecraft link CODE`.
 * Rows are removed by a TTL index on `expiresAt`, so expiry needs no scheduler.
 */
export interface IMinecraftLinkCode extends Document {
    guildId: string;
    /** Uppercase code shown to the player (see MINECRAFT_LINK_CODE for the alphabet). */
    code: string;
    minecraftUuid: string;
    minecraftUsername: string;
    /** Server key that issued the code. */
    serverKey: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftLinkCodeSchema = new Schema<IMinecraftLinkCode>(
    {
        guildId: { type: String, required: true, index: true },
        code: { type: String, required: true, unique: true, uppercase: true, trim: true },
        minecraftUuid: { type: String, required: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        serverKey: { type: String, required: true, trim: true },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
);

minecraftLinkCodeSchema.index({ guildId: 1, minecraftUuid: 1 });
minecraftLinkCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MinecraftLinkCode = model<IMinecraftLinkCode>("MinecraftLinkCode", minecraftLinkCodeSchema);
