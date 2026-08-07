import { Schema, model, type Document } from "mongoose";

/** Immutable audit row written by the plugin for every completed ore-exchange sale. */
export interface IMinecraftTransaction extends Document {
    guildId: string;
    discordId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    /** Bukkit `Material` name of the sold item. */
    itemKey: string;
    /** Units removed from the player's inventory. */
    amount: number;
    /** Coins credited, i.e. `amount * unitPrice`. */
    coins: number;
    /** Unit price at the moment of sale — kept so history stays correct after a price change. */
    unitPrice: number;
    /** Server key the sale happened on. */
    serverKey: string;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftTransactionSchema = new Schema<IMinecraftTransaction>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        itemKey: { type: String, required: true, uppercase: true, trim: true },
        amount: { type: Number, required: true, min: 1 },
        coins: { type: Number, required: true, min: 0 },
        unitPrice: { type: Number, required: true, min: 0 },
        serverKey: { type: String, required: true, trim: true },
    },
    { timestamps: true }
);

minecraftTransactionSchema.index({ guildId: 1, createdAt: -1 });
minecraftTransactionSchema.index({ guildId: 1, discordId: 1, createdAt: -1 });

export const MinecraftTransaction = model<IMinecraftTransaction>("MinecraftTransaction", minecraftTransactionSchema);
