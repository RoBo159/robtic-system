import { defineFeature } from "@typings/feature";

/**
 * The activity economy: Points earned by participating, and RC converted from them.
 *
 * Separate from `coins`, which is the Minecraft in-game wallet spoken over the plugin API. Points
 * are the Discord-side currency every activity system pays into — messages, combo, streak, voice,
 * and whatever is added next.
 *
 * `default-on`: members accrue Points from activity that is already happening, and nothing is
 * spent or announced without someone asking for it.
 */
export const pointsFeature = defineFeature({
    key: "points",
    description: "Activity points and RC",
    activation: "default-on",
    commands: [
        {
            name: "points",
            description: "Points earned from activity, and converting them to RC",
            scope: "guild",
            access: "general",
            category: "Economy",
            subcommands: [
                {
                    name: "balance",
                    description: "See your points, RC and rank (or another member's)",
                    options: [{ name: "user", description: "Member to check (defaults to yourself)", type: "user" }],
                },
                { name: "rates", description: "How points are earned here, and the RC rate" },
                { name: "history", description: "Your recent point activity" },
                {
                    name: "convert",
                    description: "Convert points into RC",
                    options: [{ name: "points", description: "How many points to convert", type: "integer", required: true, minValue: 1 }],
                },
                {
                    name: "add",
                    description: "Grant points to a member (admins only)",
                    options: [
                        { name: "user", description: "Member to credit", type: "user", required: true },
                        { name: "amount", description: "How many points", type: "integer", required: true, minValue: 1 },
                        { name: "reason", description: "Why", type: "string" },
                    ],
                },
                {
                    name: "remove",
                    description: "Deduct points from a member (admins only)",
                    options: [
                        { name: "user", description: "Member to debit", type: "user", required: true },
                        { name: "amount", description: "How many points", type: "integer", required: true, minValue: 1 },
                        { name: "reason", description: "Why", type: "string" },
                    ],
                },
                {
                    name: "migrate-coins",
                    description: "One-time: move legacy coin balances into points (admins only)",
                    options: [{ name: "confirm", description: "Type true to run it — this zeroes coin balances", type: "boolean", required: true }],
                },
            ],
        },
    ],
});
