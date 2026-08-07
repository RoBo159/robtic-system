/**
 * Shared Minecraft-integration constants. The Paper plugin mirrors these values in
 * `apps/minecraft-plugin` — the item keys below are Bukkit `Material` names so the plugin can
 * resolve them without keeping its own catalog. Prices are never listed here: they live in the
 * MinecraftItemPrice collection and are edited from Discord.
 */

/** Items the ore exchange accepts, in menu order. `defaultPrice` only seeds an unconfigured guild. */
export const MINECRAFT_SELLABLE_ITEMS = [
    { key: "IRON_ORE", label: "Iron Ore", emoji: "⛏️", defaultPrice: 25 },
    { key: "GOLD_ORE", label: "Gold Ore", emoji: "🥇", defaultPrice: 60 },
    { key: "COPPER_ORE", label: "Copper Ore", emoji: "🟠", defaultPrice: 12 },
    { key: "DIAMOND", label: "Diamond", emoji: "💎", defaultPrice: 300 },
    { key: "EMERALD", label: "Emerald", emoji: "💚", defaultPrice: 200 },
    { key: "COAL", label: "Coal", emoji: "🪨", defaultPrice: 5 },
    { key: "REDSTONE", label: "Redstone", emoji: "🔴", defaultPrice: 8 },
    { key: "LAPIS_LAZULI", label: "Lapis Lazuli", emoji: "🔵", defaultPrice: 10 },
    { key: "NETHERITE_SCRAP", label: "Netherite Scrap", emoji: "🔥", defaultPrice: 800 },
] as const;

export type MinecraftItemKey = typeof MINECRAFT_SELLABLE_ITEMS[number]["key"];

/** Item keys the exchange knows about, for validation and autocomplete. */
export const MINECRAFT_ITEM_KEYS: string[] = MINECRAFT_SELLABLE_ITEMS.map(item => item.key);

/** Account-linking code rules. Ambiguous glyphs (0/O, 1/I) are excluded from the alphabet. */
export const MINECRAFT_LINK_CODE = {
    length: 6,
    alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
    /** How long a generated code stays redeemable. */
    ttlMs: 5 * 60 * 1000,
} as const;

/** Bounds enforced on `/minecraft price set`. */
export const MINECRAFT_PRICE_LIMITS = { min: 1, max: 1_000_000 } as const;

/** Bridge/queue tuning shared by the bot consumer and the plugin poller. */
export const MINECRAFT_BRIDGE = {
    /** How often the bot drains events queued for Discord. */
    pollIntervalMs: 2_000,
    /** Events handled per drain, so one backlog can't stall the loop. */
    batchSize: 50,
    /** Queue rows are dropped by a TTL index this long after creation. */
    retentionMs: 60 * 60 * 1000,
    /** Chat text is truncated to this length in both directions. */
    maxChatLength: 256,
} as const;

/** Server-status panel behaviour. */
export const MINECRAFT_STATUS = {
    /** A server with no heartbeat for this long is reported as offline (likely crashed). */
    heartbeatTimeoutMs: 90 * 1000,
    /** How often the bot re-renders status panels and re-checks heartbeats. */
    refreshIntervalMs: 30 * 1000,
} as const;

/** In-process TTL for the price table on both sides of the bridge. */
export const MINECRAFT_PRICE_CACHE_TTL_MS = 60 * 1000;

/** Most Discord-role → LuckPerms-group mappings one guild can configure. */
export const MINECRAFT_ROLE_MAPPINGS_MAX = 25;

/** Transaction rows returned by `/minecraft history` when no limit is given. */
export const MINECRAFT_HISTORY_DEFAULT_LIMIT = 10;

/** Lifecycle states a Minecraft server reports over the bridge. */
export const MINECRAFT_SERVER_STATES = ["ONLINE", "OFFLINE", "RESTARTING", "CRASHED"] as const;
export type MinecraftServerState = typeof MINECRAFT_SERVER_STATES[number];

/** Status icons keyed by server state, used by the status embed. */
export const MINECRAFT_STATUS_ICONS: Record<MinecraftServerState, string> = {
    ONLINE: "🟢",
    OFFLINE: "🔴",
    RESTARTING: "🟠",
    CRASHED: "💥",
};
