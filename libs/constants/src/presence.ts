/** How often the rotating presence text advances. */
export const PRESENCE_ROTATE_INTERVAL_MS = 10_000;

/**
 * discord.js's ClientPresence#set fires the gateway update without awaiting it, so if the
 * shard's websocket isn't fully registered yet (a brief gap right at ClientReady), it throws an
 * unhandled "Shard not found" — give the shard a moment to settle before the first presence update.
 */
export const PRESENCE_FIRST_APPLY_DELAY_MS = 2_000;
