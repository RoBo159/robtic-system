import { carts } from "./cart-storage";

export function clearCart(userId: string): void {
    carts.delete(userId);
}
