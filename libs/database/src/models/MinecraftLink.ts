import { Schema, model, type Document } from "mongoose";

/**
 * A confirmed Discord ↔ Minecraft identity. Balances are not stored here — the link resolves a
 * Minecraft UUID to a `discordId`, and the coin balance stays in the shared Coin collection so
 * Discord remains the single source of truth for the economy.
 */
export interface IMinecraftLink extends Document {
    guildId: string;
    discordId: string;
    /** Dashed Mojang UUID of the linked player. */
    minecraftUuid: string;
    minecraftUsername: string;
    /** Server key the link was created from, for auditing multi-server setups. */
    linkedFromServer?: string;
    linkedAt: Date;
    /** Last time the plugin saw this player online, used for stale-link cleanup. */
    lastSeenAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftLinkSchema = new Schema<IMinecraftLink>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        linkedFromServer: { type: String, trim: true },
        linkedAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date },
    },
    { timestamps: true }
);

minecraftLinkSchema.index({ guildId: 1, discordId: 1 }, { unique: true });
minecraftLinkSchema.index({ guildId: 1, minecraftUuid: 1 }, { unique: true });

export const MinecraftLink = model<IMinecraftLink>("MinecraftLink", minecraftLinkSchema);
