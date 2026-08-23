import { defineFeature } from "@typings/feature";

/**
 * Robs — the **Minecraft** currency, viewed from Discord.
 *
 * Deliberately a feature of its own rather than a subcommand of `coins`. Robs and coins are
 * separate balances that never convert into one another, and hanging `/coins robs` off the coin
 * command would suggest otherwise every time somebody read the help.
 *
 * `scope: "global"` because the balance is: robs belong to a Minecraft account and are the same on
 * every game server on the network. The per-guild feature switch still governs whether the command
 * is usable in a given Discord server.
 *
 * No subcommands and no `user` option: the command answers for the caller only. Looking somebody
 * else up is what `/minecraft profile [user]` already does, and it renders their sales history
 * alongside the balance.
 */
export const robsFeature = defineFeature({
    key: "robs",
    description: "Minecraft robs balance",
    activation: "default-on",
    commands: [
        {
            name: "balance",
            description: "See your Minecraft robs balance — requires a linked Minecraft account",
            scope: "global",
            access: "general",
            category: "Economy",
        },
    ],
});
