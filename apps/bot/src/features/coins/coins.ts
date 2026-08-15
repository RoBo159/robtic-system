import { defineFeature } from "@typings/feature";

/**
 * The coin economy.
 *
 * `default-on`: coins accrue from messages, combos and streaks the moment the bot joins, matching
 * how message-stats and the combo service already behave. There is nothing to opt into — a guild
 * that wants it off says so with `/feature disable coins`.
 *
 * `add` and `remove` declare `access: "admin"` per-subcommand at the handler level rather than on
 * the command, since Discord gates whole commands and `/coins balance` must stay open to everyone.
 */
export const coinsFeature = defineFeature({
    key: "coins",
    description: "Coin economy",
    activation: "default-on",
    commands: [
        {
            name: "coins",
            description: "View and manage server coins",
            scope: "guild",
            access: "general",
            category: "Economy",
            subcommands: [
                {
                    name: "balance",
                    description: "See how many coins you (or another member) have earned",
                    options: [
                        { name: "user", description: "The member to check (defaults to yourself)", type: "user" },
                    ],
                },
                {
                    name: "add",
                    description: "Grant coins to a member (admins only)",
                    options: [
                        { name: "user", description: "The member to credit", type: "user", required: true },
                        { name: "amount", description: "How many coins to add", type: "integer", required: true, minValue: 1 },
                    ],
                },
                {
                    name: "remove",
                    description: "Deduct coins from a member (admins only)",
                    options: [
                        { name: "user", description: "The member to debit", type: "user", required: true },
                        { name: "amount", description: "How many coins to remove", type: "integer", required: true, minValue: 1 },
                    ],
                },
            ],
        },
    ],
});
