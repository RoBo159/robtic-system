import { MinecraftItemPrice, type IMinecraftItemPrice } from "@database/models/MinecraftItemPrice";

export class MinecraftItemPriceRepository {
    static async list(guildId: string): Promise<IMinecraftItemPrice[]> {
        return MinecraftItemPrice.find({ guildId }).sort({ itemKey: 1 });
    }

    static async get(guildId: string, itemKey: string): Promise<IMinecraftItemPrice | null> {
        return MinecraftItemPrice.findOne({ guildId, itemKey: itemKey.toUpperCase() });
    }

    static async set(guildId: string, itemKey: string, price: number, updatedBy?: string): Promise<IMinecraftItemPrice> {
        return MinecraftItemPrice.findOneAndUpdate(
            { guildId, itemKey: itemKey.toUpperCase() },
            { $set: { price, updatedBy }, $setOnInsert: { enabled: true } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftItemPrice>;
    }

    static async setEnabled(guildId: string, itemKey: string, enabled: boolean): Promise<IMinecraftItemPrice | null> {
        return MinecraftItemPrice.findOneAndUpdate(
            { guildId, itemKey: itemKey.toUpperCase() },
            { $set: { enabled } },
            { returnDocument: "after" }
        );
    }

    static async remove(guildId: string, itemKey: string): Promise<boolean> {
        const result = await MinecraftItemPrice.deleteOne({ guildId, itemKey: itemKey.toUpperCase() });
        return result.deletedCount > 0;
    }

    /** Inserts the given prices only where the guild has no row yet; existing prices are untouched. */
    static async seedMissing(guildId: string, defaults: { itemKey: string; price: number }[]): Promise<number> {
        if (defaults.length === 0) return 0;

        const result = await MinecraftItemPrice.bulkWrite(
            defaults.map(({ itemKey, price }) => ({
                updateOne: {
                    filter: { guildId, itemKey: itemKey.toUpperCase() },
                    update: { $setOnInsert: { guildId, itemKey: itemKey.toUpperCase(), price, enabled: true } },
                    upsert: true,
                },
            }))
        );

        return result.upsertedCount;
    }
}
