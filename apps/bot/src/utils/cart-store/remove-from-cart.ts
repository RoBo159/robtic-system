import { carts, type CartItem } from "./cart-storage";

export function removeFromCart(userId: string, index: number): CartItem[] {
    const cart = carts.get(userId) ?? [];
    cart.splice(index, 1);
    carts.set(userId, cart);
    return cart;
}
