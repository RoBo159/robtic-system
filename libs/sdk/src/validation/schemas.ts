import { v, type Validator } from "./validator";
import { STAFF_ACTIONS } from "../constants/staff-actions";

/** Mojang UUIDs, dashed or undashed. Stored dashed and lowercase everywhere downstream. */
export const UUID_PATTERN = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

/** Discord snowflakes. */
export const SNOWFLAKE_PATTERN = /^\d{15,25}$/;

/** Minecraft usernames, per Mojang's own rule. */
/**
 * A player name, Java or Bedrock.
 *
 * Java names are the familiar 3–16 of `[a-zA-Z0-9_]`. Bedrock names reaching a Java server through
 * Geyser are not: Floodgate prefixes them (`.` by default, and operators change it), and a Bedrock
 * gamertag may contain spaces. Restricting this to the Java alphabet did not keep those players
 * out — it let them join and then rejected every request that carried their name, so their chat
 * never reached Discord, their disconnect failed validation, and `/link` answered with a
 * non-retryable error the plugin reports as "this server's connection is misconfigured". One
 * pattern, three unrelated-looking faults.
 *
 * Widened to the union, bounded at 32 so it is still a name rather than a payload. Every consumer
 * escapes it before display — `escapeMarkdown` on the Discord side, the webhook username sanitiser
 * on the relay — so the extra characters change what is accepted, not how it is rendered.
 */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.\- ]{1,32}$/;

/** Bukkit material names, which is what an item key is. */
export const ITEM_KEY_PATTERN = /^[A-Z0-9_]{1,64}$/;

/** Server keys, matching the existing `server.key` convention in the plugin config. */
export const SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Normalises a UUID to the dashed lowercase form the database stores. */
export function normaliseUuid(value: string): string {
    const bare = value.replace(/-/g, "").toLowerCase();
    return [
        bare.slice(0, 8),
        bare.slice(8, 12),
        bare.slice(12, 16),
        bare.slice(16, 20),
        bare.slice(20, 32),
    ].join("-");
}

export const schema = {
    uuid: (): Validator<string> => {
        const inner = v.string({ pattern: UUID_PATTERN });
        return (value, field, errors) => {
            const text = inner(value, field, errors);
            return text && UUID_PATTERN.test(text) ? normaliseUuid(text) : text;
        };
    },

    snowflake: () => v.string({ pattern: SNOWFLAKE_PATTERN }),
    username: () => v.string({ pattern: USERNAME_PATTERN }),
    itemKey: () => {
        const inner = v.string({ min: 1, max: 64 });
        return ((value, field, errors) => inner(value, field, errors).toUpperCase()) as Validator<string>;
    },
    serverId: () => v.string({ pattern: SERVER_ID_PATTERN }),

    /** Free text a moderator typed: bounded, but not pattern-restricted. */
    reason: (max = 512) => v.string({ min: 1, max }),

    /** Idempotency key. Any opaque token the caller can guarantee unique per logical request. */
    requestId: () => v.string({ min: 8, max: 128 }),

    staffAction: () => v.oneOf(STAFF_ACTIONS),

    /** The identity block every plugin request carries. */
    serverIdentity: () => ({
        serverId: schema.serverId(),
        serverName: v.string({ min: 1, max: 64 }),
        serverType: v.optional(v.string({ max: 32 })),
        pluginVersion: v.optional(v.string({ max: 32 })),
    }),

    location: () =>
        v.object({
            world: v.string({ min: 1, max: 64 }),
            x: v.number(),
            y: v.number(),
            z: v.number(),
            yaw: v.withDefault(v.number(), 0),
            pitch: v.withDefault(v.number(), 0),
        }),

    /**
     * The staff-mode snapshot. The item blobs are opaque Base64 produced by Bukkit's own
     * serialiser — the API stores and returns them verbatim and never attempts to parse them,
     * which is what keeps it free of any Minecraft-version coupling.
     */
    inventorySnapshot: () =>
        v.object({
            inventory: v.string({ max: 200_000, trim: false }),
            armor: v.string({ max: 50_000, trim: false }),
            offhand: v.string({ max: 50_000, trim: false }),
            enderChest: v.optional(v.string({ max: 200_000, trim: false })),
            xpLevel: v.number({ min: 0, integer: true }),
            xpProgress: v.number({ min: 0, max: 1 }),
            food: v.number({ min: 0, max: 20, integer: true }),
            health: v.number({ min: 0, max: 1024 }),
            heldSlot: v.number({ min: 0, max: 8, integer: true }),
            location: schema.location(),
        }),
};
