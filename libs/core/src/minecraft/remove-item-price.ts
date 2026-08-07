import { MinecraftItemPriceRepository } from "@database/repositories";
import { Logger } from "@logger";
import { invalidatePriceCache } from "./get-item-prices";
import { publishBridgeEvent } from "./publish-bridge-event";

/**
 * Removes a guild's price override. The item then falls back to its catalog default rather than
 * disappearing — use `/minecraft price disable` to take an item out of the exchange entirely.
 */
export async function removeItemPrice(guildId: string, itemKey: string): Promise<boolean> {
    const key = itemKey.trim().toUpperCase();
    const removed = await MinecraftItemPriceRepository.remove(guildId, key);
    if (!removed) return false;

    invalidatePriceCache(guildId);
    await publishBridgeEvent({ guildId, type: "price_invalidate", payload: { itemKey: key } });

    Logger.info(`Price override for ${key} removed`, "Minecraft");
    return true;
}
