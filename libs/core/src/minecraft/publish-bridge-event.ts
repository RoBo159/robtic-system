import { MinecraftBridgeRepository } from "@database/repositories";
import type { MinecraftBridgeEventType } from "@database/models/MinecraftBridgeEvent";
import { MINECRAFT_BRIDGE } from "@constants";
import { Logger } from "@logger";

export interface BridgeEventInput {
    guildId: string;
    type: MinecraftBridgeEventType;
    payload: Record<string, unknown>;
    /** Target server key, or null to broadcast to every server in the guild. */
    serverKey?: string | null;
}

/**
 * Queues an event for the Minecraft side. Publishing never throws into the caller's flow — a
 * bridge outage must not break the Discord interaction that triggered it.
 */
export async function publishBridgeEvent(event: BridgeEventInput): Promise<boolean> {
    try {
        await MinecraftBridgeRepository.publish({
            guildId: event.guildId,
            direction: "to_minecraft",
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
