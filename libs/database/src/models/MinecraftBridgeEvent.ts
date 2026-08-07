import { Schema, model, type Document } from "mongoose";

/**
 * Direction of a queued bridge event. `to_discord` is drained by the bot's bridge consumer,
 * `to_minecraft` by the plugin's poller — neither side needs an open port on the other.
 */
export const MINECRAFT_BRIDGE_DIRECTIONS = ["to_discord", "to_minecraft"] as const;
export type MinecraftBridgeDirection = typeof MINECRAFT_BRIDGE_DIRECTIONS[number];

/** Event kinds carried over the bridge. */
export const MINECRAFT_BRIDGE_EVENT_TYPES = [
    "chat",
    "server_status",
    "player_join",
    "player_quit",
    "price_invalidate",
    "role_sync",
    /** Staff-only chat, mirrored between the in-game channel and the Discord staff channel. */
    "staff_chat",
    /** Discord asked the plugin to release a jail early, e.g. from a moderator command. */
    "jail_release",
    /** Discord asked the plugin to thaw a frozen player. */
    "freeze_release",
    /** The guild's staff ranks, lobbies or logging targets changed; the plugin drops its cache. */
    "config_invalidate",
] as const;
export type MinecraftBridgeEventType = typeof MINECRAFT_BRIDGE_EVENT_TYPES[number];

/**
 * A single queued message on the MongoDB-backed bridge, claimed atomically so nothing is ever
 * delivered twice. Rows expire via a TTL index (see MINECRAFT_BRIDGE.retentionMs).
 *
 * The two directions claim differently because they have different consumer counts:
 * `to_discord` has exactly one consumer (the bot) and uses the `consumed` flag, while
 * `to_minecraft` may be a broadcast that every server in the guild must receive, so each server
 * adds its own key to `consumedBy` instead.
 */
export interface IMinecraftBridgeEvent extends Document {
    guildId: string;
    direction: MinecraftBridgeDirection;
    type: MinecraftBridgeEventType;
    /** Target server key, or null to broadcast to every server in the guild. */
    serverKey: string | null;
    /** Type-specific body; shape is documented per event type in docs/bot/minecraft.md. */
    payload: Record<string, unknown>;
    consumed: boolean;
    consumedAt?: Date;
    /** Server keys that have already handled this event (`to_minecraft` only). */
    consumedBy: string[];
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftBridgeEventSchema = new Schema<IMinecraftBridgeEvent>(
    {
        guildId: { type: String, required: true, index: true },
        direction: { type: String, required: true, enum: [...MINECRAFT_BRIDGE_DIRECTIONS] },
        type: { type: String, required: true, enum: [...MINECRAFT_BRIDGE_EVENT_TYPES] },
        serverKey: { type: String, default: null },
        payload: { type: Schema.Types.Mixed, default: {} },
        consumed: { type: Boolean, default: false },
        consumedAt: { type: Date },
        consumedBy: { type: [String], default: [] },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
);

minecraftBridgeEventSchema.index({ guildId: 1, direction: 1, consumed: 1, createdAt: 1 });
minecraftBridgeEventSchema.index({ guildId: 1, direction: 1, consumedBy: 1, createdAt: 1 });
minecraftBridgeEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MinecraftBridgeEvent = model<IMinecraftBridgeEvent>("MinecraftBridgeEvent", minecraftBridgeEventSchema);
