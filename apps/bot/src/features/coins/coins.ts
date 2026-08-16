import { defineFeature } from "@typings/feature";

/**
 * The coin economy — the Minecraft wallet.
 *
 * `scope: "global"`: one balance per person, shared across every server and every game server on
 * the network. Coins are not earned from Discord activity at all any more (that is Points); they
 * move over /api/economy and through the admin subcommands below.
 *
 * `default-on` still, and the per-guild feature switch still applies — it governs whether the
 * *commands* work here, not whose money it is.
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
            description: "View and manage coins — one shared balance across every server",
            scope: "global",
            access: "general",
            category: "Economy",
            subcommands: [
                {
                    name: "balance",
                    description: "See your global coin balance (or another member's)",
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
