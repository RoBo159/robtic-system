import { carts, type CartItem } from "./cart-storage";

export function getCart(userId: string): CartItem[] {
    return carts.get(userId) ?? [];
}
