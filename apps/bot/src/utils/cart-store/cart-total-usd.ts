import type { CartItem } from "./cart-storage";

export function cartTotalUsd(items: CartItem[]): number {
    return items.reduce((sum, i) => sum + i.priceUsd, 0);
}
