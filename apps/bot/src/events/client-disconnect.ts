import { sendAlert } from "@core/status/send-alert";
import { Events } from "discord.js";
import { Logger } from "@logger";
import { ALERT_MESSAGES } from "@constants";

export default {
    name: Events.ShardDisconnect,
    async execute(event: CloseEvent, shardId: number) {
        Logger.error(`Shard ${shardId} disconnected: ${event.code} - ${event.reason}`, "Client");
        await sendAlert({
            title: ALERT_MESSAGES.gatewayDisconnect.title,
            description: ALERT_MESSAGES.gatewayDisconnect.description,
            color: ALERT_MESSAGES.gatewayDisconnect.color,
            fields: [
                { name: "Shard", value: String(shardId) },
                { name: "Code", value: String(event.code) },
                { name: "Reason", value: event.reason || "Unknown" }
            ]
        });
    }
}
