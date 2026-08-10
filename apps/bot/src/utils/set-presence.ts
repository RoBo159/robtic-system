import type { BotClient } from "@core/bot-client";
import { ActivityType, type PresenceStatusData } from "discord.js";
import { Logger } from "@logger";
import { PRESENCE_ROTATE_INTERVAL_MS, PRESENCE_FIRST_APPLY_DELAY_MS } from "@constants";

export function setPresence(
    client: BotClient,
    status: PresenceStatusData,
    activityType: keyof typeof ActivityType,
    activityNames: string[]
) {
    if (!client.user || activityNames.length === 0) return;

    let index = 0;

    const apply = () => {
        const activity = activityNames[index];

        try {
            client.user?.setPresence({
                status,
                activities: [
                    {
                        name: activity,
                        type: ActivityType[activityType],
                    },
                ],
            });
        } catch (err) {
            Logger.warn(`Presence update skipped: ${err}`, client.botName);
        }

        index = (index + 1) % activityNames.length;
    };

    setTimeout(apply, PRESENCE_FIRST_APPLY_DELAY_MS);

    setInterval(apply, PRESENCE_ROTATE_INTERVAL_MS);
}
