import { defineFeature } from "@typings/feature";

/**
 * The cross-category leaderboard panel.
 *
 * `default-on` because it only reads data other features already collect — there is nothing to
 * configure and nothing to consent to, so a guild that never touches /feature still gets it.
 */
export const topFeature = defineFeature({
    key: "top",
    description: "Leaderboard panel",
    activation: "default-on",
    commands: [
        {
            name: "top",
            description: "View the top 5 members for streak, combo, XP, or messages",
            scope: "guild",
            access: "general",
            category: "Leaderboard",
        },
    ],
    components: ["top"],
});
