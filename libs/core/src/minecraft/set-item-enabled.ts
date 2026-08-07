import { MinecraftItemPriceRepository } from "@database/repositories";
import { MINECRAFT_ITEM_KEYS, MINECRAFT_SELLABLE_ITEMS } from "@constants";
import { invalidatePriceCache } from "./get-item-prices";
import { publishBridgeEvent } from "./publish-bridge-event";

/**
 * Shows or hides an item in the exchange. Toggling an item the guild never priced creates the row
 * at its catalog default first, so the flag has something to live on.
 */
export async function setItemEnabled(guildId: string, itemKey: string, enabled: boolean): Promise<boolean> {
    const key = itemKey.trim().toUpperCase();
    if (!MINECRAFT_ITEM_KEYS.includes(key)) return false;

    const existing = await MinecraftItemPriceRepository.get(guildId, key);
    if (!existing) {
        const fallback = MINECRAFT_SELLABLE_ITEMS.find(item => item.key === key)!;
        await MinecraftItemPriceRepository.set(guildId, key, fallback.defaultPrice);
    }

    await MinecraftItemPriceRepository.setEnabled(guildId, key, enabled);
    invalidatePriceCache(guildId);
    await publishBridgeEvent({ guildId, type: "price_invalidate", payload: { itemKey: key } });

    return true;
}
