/** `/coins` replies. Plain text rather than an embed — the answer is one number. */
export const COIN_MESSAGES = {
    guildOnly: "This command can only be used in a server.",
    ownBalance: (coins: number) => `🪙 You have **${coins}** coin${coins === 1 ? "" : "s"}.`,
    otherBalance: (displayName: string, coins: number) => `🪙 **${displayName}** has **${coins}** coin${coins === 1 ? "" : "s"}.`,
} as const;
