import { sendAlert } from "@core/status/send-alert";
import { Events } from "discord.js";
import { Logger } from "@logger";
import { ALERT_MESSAGES } from "@constants";

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
            title: ALERT_MESSAGES.clientError.title,
            description: ALERT_MESSAGES.clientError.description,
            color: ALERT_MESSAGES.clientError.color,
            fields: [
                { name: "Error", value: error.toString() }
            ]
        });
    }
}
