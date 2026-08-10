import type { Client } from "discord.js";
import { processGuildDecay } from "./process-guild-decay";

export async function runDecayCycle(client: Client): Promise<void> {
    for (const [, guild] of client.guilds.cache) {
        await processGuildDecay(client, guild);
    }
}
