import { MINECRAFT_SELLABLE_ITEMS } from "@constants";

const LABELS = new Map<string, string>(
    MINECRAFT_SELLABLE_ITEMS.map(item => [item.key, `${item.emoji} ${item.label}`])
);

/** Display label for an item key, falling back to a readable form of an unknown key. */
export function itemLabel(itemKey: string): string {
    return LABELS.get(itemKey.toUpperCase())
        ?? itemKey.toLowerCase().split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
