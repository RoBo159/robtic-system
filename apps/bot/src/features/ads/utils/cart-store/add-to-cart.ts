import { carts, type CartItem } from "./cart-storage";

export function addToCart(userId: string, item: CartItem): CartItem[] {
    const cart = carts.get(userId) ?? [];
    cart.push(item);
    carts.set(userId, cart);
    return cart;
}
