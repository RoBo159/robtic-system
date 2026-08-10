import type { AdSection } from "@database/models/AdsConfig";

export interface CartItem {
    section: AdSection;
    key: string;
    name: string;
    priceUsd: number;
}

/** In-memory ads cart per user; cleared on checkout or cancel. */
export const carts = new Map<string, CartItem[]>();
