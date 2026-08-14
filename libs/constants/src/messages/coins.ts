const plural = (coins: number) => (coins === 1 ? "" : "s");

/** `/coins` replies. Plain text rather than an embed — the answer is one number. */
export const COIN_MESSAGES = {
    guildOnly: "This command can only be used in a server.",
    ownBalance: (coins: number) => `🪙 You have **${coins}** coin${plural(coins)}.`,
    otherBalance: (displayName: string, coins: number) => `🪙 **${displayName}** has **${coins}** coin${plural(coins)}.`,
    adminOnly: "Only administrators can add or remove coins.",
    granted: (displayName: string, amount: number, total: number) =>
        `🪙 Gave **${amount}** coin${plural(amount)} to **${displayName}** — they now have **${total}**.`,
    deducted: (displayName: string, amount: number, total: number) =>
        `🪙 Took **${amount}** coin${plural(amount)} from **${displayName}** — they now have **${total}**.`,
    nothingToDeduct: (displayName: string) => `**${displayName}** has no coins to remove.`,
    rates: (messagesPerCoin: number, comboPerCoin: number, streakRewards: { streak: number; coins: number }[]) =>
        [
            "🪙 **How coins are earned here**",
            `• **1** coin per **${messagesPerCoin}** messages`,
            `• **1** coin per **${comboPerCoin}** combo score`,
            streakRewards.length
                ? `• Streak rewards: ${streakRewards.map(r => `**${r.streak}** days → **${r.coins}**`).join(", ")}`
                : "• No streak rewards configured",
        ].join("\n"),
} as const;
