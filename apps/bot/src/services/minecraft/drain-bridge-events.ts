import type { Client } from "discord.js";
import { MinecraftBridgeRepository } from "@database/repositories";
import { MINECRAFT_BRIDGE } from "@constants";
import { Logger } from "@logger";
import { getItemPrices } from "@core/minecraft";
import { relayChatToDiscord } from "./relay-chat-to-discord";
import { announcePlayerEvent } from "./announce-player-event";
import { refreshStatusPanel } from "./refresh-status-panel";
import { syncJoiningPlayer } from "./sync-joining-player";

/**
 * Drains one batch of events the game servers queued for Discord. Events are claimed atomically by
 * the repository, so a failure here drops that single event rather than replaying the batch —
 * chat and presence notices are not worth redelivering out of order.
 */
export async function drainBridgeEvents(client: Client, guildId: string): Promise<number> {
    const events = await MinecraftBridgeRepository.claimPending(guildId, "to_discord", MINECRAFT_BRIDGE.batchSize);
    if (events.length === 0) return 0;

    let statusDirty = false;

    for (const event of events) {
        try {
            switch (event.type) {
                case "chat":
                    await relayChatToDiscord(client, guildId, event.payload);
                    break;
                case "player_join":
                    await announcePlayerEvent(client, guildId, event.type, event.payload);
                    await syncJoiningPlayer(client, guildId, event.payload);
                    statusDirty = true;
                    break;
                case "player_quit":
                    await announcePlayerEvent(client, guildId, event.type, event.payload);
                    statusDirty = true;
                    break;
                case "server_status":
                    await getItemPrices(guildId);
                    statusDirty = true;
                    break;
                default:
                    Logger.debug(`Ignoring "${event.type}" event queued for Discord`, "Minecraft");
            }
        } catch (error) {
            Logger.error(`Failed to handle "${event.type}" bridge event: ${error}`, "Minecraft");
        }
    }

    if (statusDirty) {
        await refreshStatusPanel(client, guildId).catch(error =>
            Logger.error(`Status panel refresh failed: ${error}`, "Minecraft")
        );
    }

    return events.length;
}
