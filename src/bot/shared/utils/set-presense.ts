import type { BotClient } from "@core/BotClient";
import { ActivityType, type PresenceStatusData } from "discord.js";

const PRESENCE_INTERVAL = 10000;

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

        client.user?.setPresence({
            status,
            activities: [
                {
                    name: activity,
                    type: ActivityType[activityType],
                },
            ],
        });

        index = (index + 1) % activityNames.length;
    };

    apply();

    setInterval(apply, PRESENCE_INTERVAL);
}