function plural(value: number): string {
    return value === 1 ? "" : "s";
}

/**
 * Wording for `/balance` — the **robs** command.
 *
 * Robs are the Minecraft currency and are never described as coins here: the two are separate
 * balances, and blurring them in the copy is how players end up expecting one to fund the other.
 */
export const ROBS_MESSAGES = {
    guildOnly: "This command can only be used in a server.",

    balance: (username: string, robs: number) =>
        `⛏️ **${username}** has **${robs}** rob${plural(robs)}.`,

    /**
     * Shown when the caller has not linked a Minecraft account.
     *
     * Says what to do rather than only what went wrong, and names both halves of the flow — the
     * in-game command that issues the code and the Discord command that redeems it — because
     * running them in the wrong order is the usual mistake.
     */
    notLinked:
        "You have not linked a Minecraft account yet, so there is no balance to look up.\n\n" +
        "Run `/link` on the Minecraft server to get a code, then `/minecraft link <code>` here.",

    /** Robs are earned in game, so a zero balance is worth explaining rather than just printing. */
    empty: (username: string) =>
        `⛏️ **${username}** has **0** robs yet. Robs are earned in game — sell ore with \`/exchange\`.`,
} as const;
