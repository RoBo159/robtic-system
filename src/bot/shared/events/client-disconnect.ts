import { sendAlert } from "@core/utils/sendAlert";
import { Events, ShardEvents } from "discord.js";
import { Logger } from "@core/libs/logger";

export default {
    name: Events.ShardDisconnect,
    async execute(event: CloseEvent, shardId: number) {
        Logger.error(`Shard ${shardId} disconnected: ${event.code} - ${event.reason}`, "Client");
        await sendAlert({
            title: "Discord Gateway Disconnect",
            description: "Bot disconnected from Discord",
            color: 16776960,
            fields: [
                { name: "Shard", value: String(shardId) },
                { name: "Code", value: String(event.code) },
                { name: "Reason", value: event.reason || "Unknown" }
            ]
        });
    }
}