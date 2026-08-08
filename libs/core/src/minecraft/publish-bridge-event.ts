import { MinecraftBridgeRepository } from "@database/repositories";
import type {
    MinecraftBridgeDirection,
    MinecraftBridgeEventType,
} from "@database/models/MinecraftBridgeEvent";
import { MINECRAFT_BRIDGE } from "@constants";
import { Logger } from "@logger";

export interface BridgeEventInput {
    guildId: string;
    type: MinecraftBridgeEventType;
    payload: Record<string, unknown>;
    /** Target server key, or null to broadcast to every server in the guild. */
    serverKey?: string | null;
    /**
     * Which side drains this event. Defaults to `to_minecraft`, which is what a Discord-side
     * caller wants.
     *
     * It must be passed explicitly by anything relaying *out of* the game — a `chat` line a
     * player typed in game is the same event *type* as a `chat` line typed in Discord, and the
     * direction is the only thing that distinguishes them. Publishing an outbound line into the
     * inbound queue does not merely fail to reach Discord: the plugin's own poller claims it and
     * echoes the player's message back at them as if Discord had said it.
     */
    direction?: MinecraftBridgeDirection;
}

/**
 * Queues an event for the other side of the bridge. Publishing never throws into the caller's
 * flow — a bridge outage must not break the Discord interaction that triggered it.
 */
export async function publishBridgeEvent(event: BridgeEventInput): Promise<boolean> {
    try {
        await MinecraftBridgeRepository.publish({
            guildId: event.guildId,
            direction: event.direction ?? "to_minecraft",
            type: event.type,
            payload: event.payload,
            serverKey: event.serverKey ?? null,
            retentionMs: MINECRAFT_BRIDGE.retentionMs,
        });
        return true;
    } catch (error) {
        Logger.error(`Failed to publish "${event.type}" bridge event: ${error}`, "Minecraft");
        return false;
    }
}
