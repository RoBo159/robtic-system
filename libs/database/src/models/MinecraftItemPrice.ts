import { Schema, model, type Document } from "mongoose";

/**
 * Coins paid per unit of one sellable item in one guild. The plugin reads these through a cached
 * repository and never hardcodes a price — `/minecraft price set` takes effect on the next refresh.
 */
export interface IMinecraftItemPrice extends Document {
    guildId: string;
    /** Bukkit `Material` name, e.g. "IRON_ORE" (see MINECRAFT_SELLABLE_ITEMS). */
    itemKey: string;
    /** Coins paid for one unit. */
    price: number;
    /** Disabled items stay configured but are hidden from the exchange menu. */
    enabled: boolean;
    /** Discord id of the admin who last changed the price. */
    updatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftItemPriceSchema = new Schema<IMinecraftItemPrice>(
    {
        guildId: { type: String, required: true, index: true },
        itemKey: { type: String, required: true, uppercase: true, trim: true },
        price: { type: Number, required: true, min: 0 },
        enabled: { type: Boolean, default: true },
        updatedBy: { type: String },
    },
    { timestamps: true }
);

minecraftItemPriceSchema.index({ guildId: 1, itemKey: 1 }, { unique: true });

export const MinecraftItemPrice = model<IMinecraftItemPrice>("MinecraftItemPrice", minecraftItemPriceSchema);
