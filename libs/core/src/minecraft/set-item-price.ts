import { MinecraftItemPriceRepository } from "@database/repositories";
import { MINECRAFT_ITEM_KEYS, MINECRAFT_PRICE_LIMITS } from "@constants";
import { Logger } from "@logger";
import { invalidatePriceCache } from "./get-item-prices";
import { publishBridgeEvent } from "./publish-bridge-event";

export type PriceUpdateResult =
    | { ok: true; itemKey: string; price: number }
    | { ok: false; reason: "unknown_item" | "out_of_range" };

/**
 * Sets a unit price and tells every server to drop its cached table, so the change is live in-game
 * within one bridge poll instead of waiting out the plugin's own cache TTL.
 */
export async function setItemPrice(
    guildId: string,
    itemKey: string,
    price: number,
    updatedBy: string,
): Promise<PriceUpdateResult> {
    const key = itemKey.trim().toUpperCase();
    if (!MINECRAFT_ITEM_KEYS.includes(key)) return { ok: false, reason: "unknown_item" };
    if (price < MINECRAFT_PRICE_LIMITS.min || price > MINECRAFT_PRICE_LIMITS.max) {
        return { ok: false, reason: "out_of_range" };
    }

    await MinecraftItemPriceRepository.set(guildId, key, price, updatedBy);
    invalidatePriceCache(guildId);
    await publishBridgeEvent({ guildId, type: "price_invalidate", payload: { itemKey: key } });

    Logger.info(`Price for ${key} set to ${price} by ${updatedBy}`, "Minecraft");
    return { ok: true, itemKey: key, price };
}
