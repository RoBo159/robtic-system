import type { BotClient } from "@core/bot-client";
import { Events } from "discord.js";
import { Logger } from "@logger";

let processHandlersRegistered = false;

export class DiscordErrorHandler {
    constructor(private client: BotClient) {}

    public init(): void {
        // uncaughtException/unhandledRejection are global process events, not per-client — a second
        // handler would log the same real error twice.
        if (!processHandlersRegistered) {
            processHandlersRegistered = true;

            process.on("uncaughtException", (error) => {
                Logger.error(`[UncaughtException] ${error}`, "Process");
            });

            process.on("unhandledRejection", (error) => {
                Logger.error(`[UnhandledRejection] ${error}`, "Process");
            });
        }

        this.client.on(Events.Error, (err) => {
            const isMissingPermissions = (err as { code?: number }).code === 50013;
            if (isMissingPermissions) {
                Logger.warn(`[DiscordClientWarning] ${err}`, this.client.botName);
                return;
            }

            Logger.error(`[DiscordClientError] ${err}`, this.client.botName);
        });

        this.client.on(Events.ShardError, (err, shardId) => {
            Logger.error(`[Shard ${shardId} Error] ${err}`, this.client.botName);
        });
    }
}
