const plural = (n: number) => (n === 1 ? "" : "s");

/** `/points` replies. */
export const POINT_MESSAGES = {
    guildOnly: "This command can only be used in a server.",
    adminOnly: "Only administrators can adjust balances.",

    ownBalance: (points: number, rc: number, rank: number) =>
        `🎯 You have **${points}** point${plural(points)}` +
        (rc > 0 ? ` and **${rc}** RC` : "") +
        (rank > 0 ? ` — rank **#${rank}**.` : "."),

    otherBalance: (name: string, points: number, rc: number, rank: number) =>
        `🎯 **${name}** has **${points}** point${plural(points)}` +
        (rc > 0 ? ` and **${rc}** RC` : "") +
        (rank > 0 ? ` — rank **#${rank}**.` : "."),

    granted: (name: string, amount: number, total: number) =>
        `🎯 Gave **${amount}** point${plural(amount)} to **${name}** — they now have **${total}**.`,
    deducted: (name: string, amount: number, total: number) =>
        `🎯 Took **${amount}** point${plural(amount)} from **${name}** — they now have **${total}**.`,
    nothingToDeduct: (name: string) => `**${name}** has no points to remove.`,

    conversionDisabled: "Converting points to RC is switched off in this server.",
    belowMinimum: (min: number) => `❌ The smallest conversion is **${min}** points.`,
    notAMultiple: (rate: number) => `❌ Convert in multiples of **${rate}** points — that is one RC.`,
    insufficient: (have: number) => `❌ You only have **${have}** point${plural(have)}.`,
    converted: (points: number, rc: number, pointsLeft: number, rcTotal: number) =>
        `✨ Converted **${points}** points into **${rc}** RC.\nYou now have **${pointsLeft}** points and **${rcTotal}** RC.`,

    noHistory: "No point activity yet.",
} as const;
