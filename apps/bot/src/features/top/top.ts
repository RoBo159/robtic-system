import { defineFeature } from "@typings/feature";
import { TOP_CATEGORIES } from "@constants";

/**
 * The leaderboards.
 *
 * Bare `/top` shows every board's top five side by side; naming a category shows that one in depth
 * — top ten, plus where the caller sits. That replaced a category dropdown, which made the panel
 * stateful in a way that was easy to leave pointing at the wrong board.
 *
 * `default-on` because it only reads data other features already collect.
 */
export const topFeature = defineFeature({
    key: "top",
    description: "Leaderboards",
    activation: "default-on",
    commands: [
        {
            name: "top",
            description: "Leaderboards — all of them, or one in depth",
            scope: "guild",
            access: "general",
            category: "Leaderboard",
            options: [
                {
                    name: "category",
                    description: "Show just this board, in depth. Leave empty for all of them.",
                    type: "string",
                    choices: TOP_CATEGORIES.map(c => ({ name: c, value: c })),
                },
            ],
        },
    ],
    components: ["top"],
});
