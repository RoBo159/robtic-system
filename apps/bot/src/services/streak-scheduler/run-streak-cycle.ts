import type { Client } from "discord.js";
import { processGuildStreaks } from "./process-guild-streaks";

export async function runStreakCycle(client: Client): Promise<void> {
    for (const [, guild] of client.guilds.cache) {
        await processGuildStreaks(client, guild);
    }
}
