import { Schema, model, type Document } from "mongoose";

/**
 * Immutable audit row for one completed ore-exchange sale, paid in robs.
 *
 * Keyed by UUID for the same reason {@link Rob} is: the sale happened in Minecraft and must be
 * recordable for a player who has never linked Discord. `discordId` is optional and is only filled
 * in when a link happened to exist at the time of sale, so it is safe to read for display and
 * unsafe to filter on when completeness matters — use `minecraftUuid` for that.
 *
 * This replaces `MinecraftTransaction` for anything the exchange writes from now on. The old
 * collection is left in place, unread by the exchange, holding the coin-era history.
 */
export interface IRobTransaction extends Document {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    /** Null when the seller had not linked a Discord account. */
    discordId: string | null;
    /** Bukkit `Material` name of the sold item. */
    itemKey: string;
    /** Units removed from the player's inventory. */
    amount: number;
    /** Robs credited, i.e. `amount * unitPrice`. */
    robs: number;
    /** Unit price at the moment of sale — kept so history stays correct after a price change. */
    unitPrice: number;
    /** Server key the sale happened on. */
    serverKey: string;
    createdAt: Date;
    updatedAt: Date;
}

const robTransactionSchema = new Schema<IRobTransaction>(
    {
        guildId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        discordId: { type: String, default: null, index: true },
        itemKey: { type: String, required: true, uppercase: true, trim: true },
        amount: { type: Number, required: true, min: 1 },
        robs: { type: Number, required: true, min: 0 },
        unitPrice: { type: Number, required: true, min: 0 },
        serverKey: { type: String, required: true, trim: true },
    },
    { timestamps: true }
);

robTransactionSchema.index({ guildId: 1, createdAt: -1 });
robTransactionSchema.index({ guildId: 1, minecraftUuid: 1, createdAt: -1 });

export const RobTransaction = model<IRobTransaction>("RobTransaction", robTransactionSchema);
