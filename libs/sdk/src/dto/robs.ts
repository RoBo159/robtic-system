import type { Paged, ServerIdentity } from "./common";

/**
 * The **robs** contract — the Minecraft currency.
 *
 * Every request here addresses a player by Minecraft UUID and never by Discord id. That is the
 * whole difference from the coin economy this replaced: robs belong to a Minecraft account, so an
 * unlinked player has a balance like anyone else and no request needs a link to be resolvable.
 *
 * Robs and Discord coins never convert into one another. Nothing in this file mentions coins.
 */

/** `GET /api/robs/balance/{uuid}` — never cached, on either side. */
export interface RobBalanceResponse {
    uuid: string;
    username: string;
    robs: number;
    /** Present only when the player happens to be linked; purely informational. */
    discordId: string | null;
}

/**
 * `POST /api/robs/balances` — many balances in one call.
 *
 * Exists so the plugin's placeholder refresh costs one request per pass instead of one per online
 * player. A UUID with no row yet comes back with `robs: 0` rather than being omitted, so the caller
 * can map the response positionally without re-checking which players were missing.
 */
export interface RobBalancesRequest {
    uuids: string[];
}

export interface RobBalancesResponse {
    balances: RobBalanceResponse[];
}

/** `POST /api/robs/add` and `/remove`. */
export interface RobMutationRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    amount: number;
    reason: string;
    /** Idempotency key; a replayed queue entry with the same id is applied once. */
    requestId: string;
}

export interface RobMutationResponse {
    uuid: string;
    /** Balance after the mutation. */
    robs: number;
    /** Signed delta actually applied; 0 when the request was a recognised duplicate. */
    applied: number;
    duplicate: boolean;
}

/** One line of a sell request. The plugin has already removed the items before calling. */
export interface SellLine {
    itemKey: string;
    amount: number;
}

/** `POST /api/robs/sell` — credits a completed in-game sale and writes the audit rows. */
export interface SellRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    lines: SellLine[];
    requestId: string;
}

export interface SellResponse {
    uuid: string;
    robs: number;
    /** Robs credited by this call; 0 for a recognised duplicate. */
    credited: number;
    duplicate: boolean;
    lines: Array<SellLine & { unitPrice: number; robs: number }>;
}

/** One row of the guild's price table. */
export interface ItemPriceDto {
    itemKey: string;
    label: string;
    price: number;
    enabled: boolean;
}

/** `GET /api/robs/prices`. */
export interface PriceListResponse {
    guildId: string;
    items: ItemPriceDto[];
    /** Cache validator; the plugin sends it back and gets a 304-equivalent when unchanged. */
    revision: string;
}

/** `POST /api/robs/prices` — Discord-side edit; the plugin never calls this. */
export interface SetPriceRequest {
    guildId: string;
    itemKey: string;
    price?: number;
    enabled?: boolean;
}

/** One entry of the robs leaderboard. Ranked by UUID, so unlinked players appear too. */
export interface RobLeaderboardEntry {
    position: number;
    uuid: string;
    username: string;
    robs: number;
}

/** `GET /api/robs/leaderboard`. */
export interface RobLeaderboardResponse {
    entries: RobLeaderboardEntry[];
    /** The requesting player's own standing, when a uuid was supplied and they are ranked. */
    player: { position: number; robs: number } | null;
}

export interface RobTransactionDto {
    itemKey: string;
    amount: number;
    robs: number;
    unitPrice: number;
    serverId: string;
    username: string;
    createdAt: string;
}

/** `GET /api/robs/history`. */
export type RobTransactionHistoryResponse = Paged<RobTransactionDto>;
