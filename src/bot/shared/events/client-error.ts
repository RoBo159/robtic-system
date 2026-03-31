import { sendAlert } from "@core/utils/sendAlert";
import { Events } from "discord.js";
import { Logger } from "@core/libs/logger";

export default {
    name: Events.Error,
    async execute(error: Error) {
        const isMissingPermissions = (error as { code?: number }).code === 50013;
        if (isMissingPermissions) {
            Logger.warn(`Client warning (missing permissions): ${error.message}`, "Client");
            return;
        }

        Logger.error(`Client Error: ${error.message}`, "Client");
        await sendAlert({
            title: "Discord Client Error",
            description: "The bot encountered a critical client error",
            color: 15158332,
            fields: [
                { name: "Error", value: error.toString() }
            ]
        });
    }
}