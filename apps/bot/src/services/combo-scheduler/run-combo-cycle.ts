import type { Client } from "discord.js";
import { Logger } from "@logger";
import { pruneStaleChannelBuffers } from "../combo-conversation-detector";
import { processGuildCombos } from "./process-guild-combos";

const CTX = "main:combo-scheduler";

export async function runComboCycle(client: Client): Promise<void> {
    for (const [, guild] of client.guilds.cache) {
        await processGuildCombos(guild).catch(err =>
            Logger.error(`Combo cycle failed for guild ${guild.id}: ${err}`, CTX)
        );
    }
    pruneStaleChannelBuffers();
}
