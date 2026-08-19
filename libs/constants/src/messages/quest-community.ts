/**
 * The weekly community challenge: the panel edited all week, and `/quest community`.
 *
 * Separate from `QUEST_MESSAGES` because this surface is one shared embed rather than a member's own
 * state — and separate from `COMMUNITY_MESSAGES`, which belongs to the support/staff bot and has
 * nothing to do with quests despite the word.
 */

const relative = (date: Date): string => `<t:${Math.floor(date.getTime() / 1000)}:R>`;

/** The rank bonus, spelled once so the panel and `/quest-config community` cannot disagree. */
const RANK_BONUS = "🥇 ×3 · 🥈🥉 ×2 · 4th–5th ×1.5";

export const QUEST_COMMUNITY_MESSAGES = {
    title: "🌍 Weekly Community Challenge",

    /** Placings on the contributor list. Beyond fifth it falls back to a plain number. */
    medals: ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"] as readonly string[],

    rankBonus: RANK_BONUS,

    mission: (label: string) => `**${label}**`,

    progressField: (percent: number) => `Progress — ${percent}%`,
    progressValue: (bar: string, total: number, target: number) =>
        `\`${bar}\`\n${total.toLocaleString()} / ${target.toLocaleString()}`,

    rewardField: "Reward",
    rewardValue: (rewardBase: number) => `🎯 ${rewardBase.toLocaleString()} points each\n${RANK_BONUS}`,

    timeLeftField: "Time left",
    timeLeftValue: relative,

    topField: "Top contributors",
    topRow: (medal: string, discordId: string, amount: number) =>
        `${medal} <@${discordId}> — ${amount.toLocaleString()}`,
    fallbackMedal: (index: number) => `${index + 1}.`,

    footerCompleted: (contributors: number) => `Completed by ${contributors}+ contributors`,
    footerMissed: "The week ended before the goal was reached",
    footerRunning: "Everyone contributes automatically — just be active",

    /** `/quest community` with nothing running. */
    noneRunning: "No challenge is running. A new one opens at the start of the week.",
    disabled: "Community challenges are switched off in this server.",

    /** The personal fields `/quest community` adds on top of the shared panel. */
    yourContributionField: "Your contribution",
    yourContributionQualified: (amount: number) => `${amount.toLocaleString()} — you qualify for the reward`,
    yourContributionShort: (amount: number, missing: number) =>
        `${amount.toLocaleString()} — ${missing.toLocaleString()} more to qualify`,

    contributorsField: "Contributors",
} as const;
