import { MinecraftItemPriceRepository } from "@database/repositories";
import { MINECRAFT_PRICE_CACHE_TTL_MS, MINECRAFT_SELLABLE_ITEMS } from "@constants";

export interface MinecraftPriceEntry {
    itemKey: string;
    label: string;
    emoji: string;
    price: number;
    enabled: boolean;
    /** False when the guild has no row yet and `price` is the catalog default. */
    configured: boolean;
}

const cache = new Map<string, { entries: MinecraftPriceEntry[]; expiresAt: number }>();

/**
 * The guild's price table in catalog order, with unconfigured items falling back to their default.
 * Cached for MINECRAFT_PRICE_CACHE_TTL_MS; every write path calls `invalidatePriceCache` so an
 * admin edit is visible immediately rather than after the TTL.
 */
export async function getItemPrices(guildId: string): Promise<MinecraftPriceEntry[]> {
    const cached = cache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) return cached.entries;

    let rows = await MinecraftItemPriceRepository.list(guildId);

    if (rows.length === 0) {
        await MinecraftItemPriceRepository.seedMissing(
            guildId,
            MINECRAFT_SELLABLE_ITEMS.map(item => ({ itemKey: item.key, price: item.defaultPrice })),
        );
        rows = await MinecraftItemPriceRepository.list(guildId);
    }

    const byKey = new Map(rows.map(row => [row.itemKey, row]));

    const entries: MinecraftPriceEntry[] = MINECRAFT_SELLABLE_ITEMS.map(item => {
        const row = byKey.get(item.key);
        return {
            itemKey: item.key,
            label: item.label,
            emoji: item.emoji,
            price: row?.price ?? item.defaultPrice,
            enabled: row?.enabled ?? true,
            configured: Boolean(row),
        };
    });

    cache.set(guildId, { entries, expiresAt: Date.now() + MINECRAFT_PRICE_CACHE_TTL_MS });
    return entries;
}

/** Drops the cached table for a guild, or every guild when called with no argument. */
export function invalidatePriceCache(guildId?: string): void {
    if (guildId) cache.delete(guildId);
    else cache.clear();
}
