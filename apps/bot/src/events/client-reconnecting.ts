import { sendAlert } from "@core/status/send-alert";
import { Events } from "discord.js";
import { Logger } from "@logger";
import { ALERT_MESSAGES } from "@constants";

export default {
    name: Events.ShardReconnecting,
    async execute(shardId: number) {
        Logger.warn(`Shard ${shardId} reconnecting...`, "Client");
        await sendAlert({
            title: ALERT_MESSAGES.gatewayReconnecting.title,
            description: ALERT_MESSAGES.gatewayReconnecting.description,
            color: ALERT_MESSAGES.gatewayReconnecting.color,
            fields: [
                { name: "Shard", value: String(shardId) }
            ]
        });
    }
}
