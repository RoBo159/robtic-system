import type { Client } from "discord.js";
import { MinecraftBridgeRepository, MinecraftServerRepository } from "@database/repositories";
import { MINECRAFT_BRIDGE, MINECRAFT_STATUS } from "@constants";
import { Logger } from "@logger";
import { drainBridgeEvents } from "./drain-bridge-events";
import { refreshStatusPanel } from "./refresh-status-panel";

const CTX = "Minecraft";

let bridgeInterval: ReturnType<typeof setInterval> | null = null;
let statusInterval: ReturnType<typeof setInterval> | null = null;
let bridgeRunning = false;
let statusRunning = false;

/** Only guilds with queued work are visited, so an idle deployment costs one distinct() per tick. */
async function bridgeTick(client: Client): Promise<void> {
    if (bridgeRunning) return;
    bridgeRunning = true;

    try {
        const guildIds = await MinecraftBridgeRepository.guildIdsWithPending("to_discord");
        for (const guildId of guildIds) {
            await drainBridgeEvents(client, guildId);
        }
    } catch (error) {
        Logger.error(`Bridge tick failed: ${error}`, CTX);
    } finally {
        bridgeRunning = false;
    }
}

/**
 * Re-renders every status panel and promotes servers that stopped sending heartbeats to CRASHED —
 * this is the only way an unclean shutdown ever gets reported, since the plugin can't write
 * OFFLINE for a process that already died.
 */
async function statusTick(client: Client): Promise<void> {
    if (statusRunning) return;
    statusRunning = true;

    try {
        const guildIds = await MinecraftServerRepository.guildIds();
        for (const guildId of guildIds) {
            const crashed = await MinecraftServerRepository.markStaleAsCrashed(
                guildId,
                MINECRAFT_STATUS.heartbeatTimeoutMs,
            );

            for (const server of crashed) {
                Logger.warn(`Server "${server.displayName}" missed its heartbeat — marked CRASHED`, CTX);
            }

            await refreshStatusPanel(client, guildId);
        }
    } catch (error) {
        Logger.error(`Status tick failed: ${error}`, CTX);
    } finally {
        statusRunning = false;
    }
}

/** Starts the bridge drain and status refresh loops. Safe to call more than once. */
export function startMinecraftScheduler(client: Client): void {
    if (!bridgeInterval) {
        bridgeInterval = setInterval(() => void bridgeTick(client), MINECRAFT_BRIDGE.pollIntervalMs);
    }

    if (!statusInterval) {
        statusInterval = setInterval(() => void statusTick(client), MINECRAFT_STATUS.refreshIntervalMs);
    }

    Logger.info("Minecraft bridge and status schedulers started", CTX);
}

export function stopMinecraftScheduler(): void {
    if (bridgeInterval) {
        clearInterval(bridgeInterval);
        bridgeInterval = null;
    }

    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
}
