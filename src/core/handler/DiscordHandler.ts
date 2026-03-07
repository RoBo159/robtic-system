import type { BotClient } from "@core/BotClient";
import { Events } from "discord.js";
import { Logger } from "@core/libs/logger";

export class DiscordErrorHandler {
    constructor(private client: BotClient) {}

    public init(): void {
        process.on("uncaughtException", (error) => {
            Logger.error(`[UncaughtException] ${error}`, this.client.botName);
        });

        process.on("unhandledRejection", (error) => {
            Logger.error(`[UnhandledRejection] ${error}`, this.client.botName);
        });

        this.client.on(Events.Error, (err) => {
            Logger.error(`[DiscordClientError] ${err}`, this.client.botName);
        });

        this.client.on(Events.ShardError, (err, shardId) => {
            Logger.error(`[Shard ${shardId} Error] ${err}`, this.client.botName);
        });
    }
}
