import { defineFeature } from "@typings/feature";

/**
 * Conversation combos: two members talking in the same channel build a shared score, with heat,
 * streaks, leaderboards and a champion role.
 *
 * `default-on` — it scores messages that are already happening and posts nothing on its own; the
 * champion role only appears once a guild configures one.
 */
export const comboFeature = defineFeature({
    key: "combo",
    description: "Conversation combos",
    activation: "default-on",
    commands: [
        {
            name: "combo",
            description: "View your conversation combo status",
            scope: "guild",
            access: "general",
            category: "Activity",
        },
    ],
    events: ["messageCreate", "clientReady"],
    components: ["combo"],
});
