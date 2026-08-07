import type { Paged, ServerIdentity } from "./common";

/** `GET /api/economy/coins/{uuid}` — never cached, on either side. */
export interface CoinBalanceResponse {
    uuid: string;
    discordId: string;
    coins: number;
}

/** `POST /api/economy/add` and `/remove`. */
export interface CoinMutationRequest extends ServerIdentity {
    guildId: string;
    uuid?: string;
    discordId?: string;
    amount: number;
    reason: string;
    /** Idempotency key; a replayed queue entry with the same id is applied once. */
    requestId: string;
}

export interface CoinMutationResponse {
    discordId: string;
    /** Balance after the mutation. */
    coins: number;
    /** Signed delta actually applied; 0 when the request was a recognised duplicate. */
    applied: number;
    duplicate: boolean;
}

/** One line of a sell request. The plugin has already removed the items before calling. */
export interface SellLine {
    itemKey: string;
    amount: number;
}

/** `POST /api/economy/sell` — credits a completed in-game sale and writes the audit rows. */
export interface SellRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    lines: SellLine[];
    requestId: string;
}

export interface SellResponse {
    discordId: string;
    coins: number;
    /** Coins credited by this call; 0 for a recognised duplicate. */
    credited: number;
    duplicate: boolean;
    lines: Array<SellLine & { unitPrice: number; coins: number }>;
}

/** One row of the guild's price table. */
export interface ItemPriceDto {
    itemKey: string;
    label: string;
    price: number;
    enabled: boolean;
}

/** `GET /api/economy/prices`. */
export interface PriceListResponse {
    guildId: string;
    items: ItemPriceDto[];
    /** Cache validator; the plugin sends it back and gets a 304-equivalent when unchanged. */
    revision: string;
}

/** `POST /api/economy/prices` — Discord-side edit; the plugin never calls this. */
export interface SetPriceRequest {
    guildId: string;
    itemKey: string;
    price?: number;
    enabled?: boolean;
}

export interface TransactionDto {
    itemKey: string;
    amount: number;
    coins: number;
    unitPrice: number;
    serverId: string;
    username: string;
    createdAt: string;
}

/** `GET /api/economy/history`. */
export type TransactionHistoryResponse = Paged<TransactionDto>;
