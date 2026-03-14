import { sendAlert } from "@core/utils/sendAlert";
import { Events } from "discord.js";
import { Logger } from "@core/libs/logger";

export default {
    name: Events.ShardReconnecting,
    async execute(shardId: number) {
        Logger.warn(`Shard ${shardId} reconnecting...`, "Client");
        await sendAlert({
            title: "Discord Gateway Reconnecting",
            description: "Bot is attempting to re-establish connection to Discord",
            color: 3447003,
            fields: [
                { name: "Shard", value: String(shardId) }
            ]
        });
    }
}