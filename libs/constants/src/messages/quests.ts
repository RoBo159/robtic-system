import type { QuestTier } from "../quests";

/**
 * Every word the quest system says to a member.
 *
 * Kept here rather than beside the embed builders so the whole voice of the feature can be read —
 * and reworded — in one place. The builders keep the parts that are not text: colours, progress
 * bars, field layout, which timestamp style to use.
 *
 * Anything that formats a value the caller already has (a bar, a duration) is taken as a parameter
 * rather than computed, because this package deliberately depends on nothing.
 */

/** Client-rendered relative time, so a countdown never costs a message edit. */
const relative = (date: Date): string => `<t:${Math.floor(date.getTime() / 1000)}:R>`;

const plural = (n: number) => (n === 1 ? "" : "s");

/** "1 message", "25 messages" — a count and its noun, agreeing. */
const counted = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/**
 * The objective wording, keyed by mission template.
 *
 * Every quest card, board row, DM and progress line renders one of these, which makes them the
 * most-read strings in the feature. The template in `libs/core` still decides which metric it
 * tracks and what the target is — it just no longer owns how the objective is phrased.
 */
export const QUEST_MISSION_LABELS = {
    "send-messages": (target: number) => `Send ${counted(target, "message")}`,
    "earn-xp": (target: number) => `Earn ${target.toLocaleString()} XP`,
    /** Tracked in seconds; the objective is read in minutes. */
    "voice-minutes": (target: number) => `Spend ${counted(Math.round(target / 60), "minute")} active in voice`,
    "voice-xp": (target: number) => `Earn ${target.toLocaleString()} XP in voice`,
    "combo-score": (target: number) => `Reach a combo score of ${target}`,
    "combo-heat": (target: number) => `Reach ${target} combo heat`,
    "reach-streak": (target: number) => `Reach a ${counted(target, "day")} streak`,
    "earn-points": (target: number) => `Earn ${counted(target, "point")}`,
    "level-up": (target: number) => (target === 1 ? "Gain a level" : `Gain ${target} levels`),
    "community-contribution": (target: number) => `Contribute ${target} to the community challenge`,
} as const;

/** The emoji that stands for a difficulty everywhere it is named. */
export const QUEST_TIER_EMOJI: Record<QuestTier, string> = {
    easy: "🟢",
    normal: "🔵",
    hard: "🟣",
    golden: "🌟",
    vip: "💎",
    special: "🎁",
};

/** How the tier is announced above the quest title. Rarity is the whole appeal of the top two. */
export const QUEST_TIER_BADGE: Record<QuestTier, string> = {
    easy: "DAILY QUEST",
    normal: "DAILY QUEST",
    hard: "RARE QUEST",
    golden: "LEGENDARY QUEST",
    vip: "VIP QUEST",
    special: "SPECIAL EVENT",
};

/** "Easy", "VIP" — the tier as a word. */
const tierName = (tier: QuestTier): string =>
    tier === "vip" ? "VIP" : tier.charAt(0).toUpperCase() + tier.slice(1);

/** Member-facing quest text: the posted card, the commands, the buttons, the DMs. */
export const QUEST_MESSAGES = {
    tierEmoji: QUEST_TIER_EMOJI,
    tierBadge: QUEST_TIER_BADGE,
    tierName,

    /** "🟢 Easy" — the one place a tier turns into display text, so every surface spells it the same. */
    tierTitle: (tier: QuestTier): string => `${QUEST_TIER_EMOJI[tier]} ${tierName(tier)}`,

    /** Routing gap: a leaf in the manifest with no handler behind it. */
    notWired: "That subcommand is not wired up yet.",

    /** The posted quest card. */
    card: {
        author: (tier: QuestTier) => `${QUEST_TIER_EMOJI[tier]}  ${QUEST_TIER_BADGE[tier]}`,
        title: (tier: QuestTier) => `${tierName(tier)} Quest`,
        objective: (index: number, label: string) => `\`${index + 1}\`  ${label}`,
        noObjectives: "No objectives.",

        rewardField: "Reward",
        rewardValue: (reward: number) => `🎯 **${reward.toLocaleString()}** points`,

        placesField: "Places",
        placesUnlimited: "♾️ Unlimited",
        placesFull: (total: number) => `🚫 **Full** — all ${total} taken`,
        placesLeft: (left: number, total: number, bar: string) => `**${left}** of ${total} left\n\`${bar}\``,

        endsField: (closed: boolean) => (closed ? "Ended" : "Ends"),
        endsValue: relative,

        objectiveCount: (count: number) => (count === 1 ? "One objective" : `${count} objectives`),
        footer: (objectiveCount: string, tier: QuestTier) =>
            tier === "vip"
                ? `${objectiveCount} · VIP members only · progress tracks itself once claimed`
                : tier === "special"
                    ? `${objectiveCount} · claimable even if you are already on a quest`
                    : `${objectiveCount} · progress tracks itself once claimed · /quest to see yours`,
    },

    /** The claim button. The label carries the remaining count so the button answers "worth clicking". */
    button: {
        full: "Full",
        closed: "Closed",
        claim: "Claim",
        claimWithSlots: (left: number) => `Claim · ${left} left`,
        openEmoji: "⚔️",
        closedEmoji: "🔒",
    },

    /** One mission line with where the member has got to. */
    missionLine: (index: number, label: string, bar: string, value: number, target: number, done: boolean) =>
        `${done ? "✅" : `\`${index + 1}.\``} ${label}\n` +
        `\`${bar}\` ${value.toLocaleString()} / ${target.toLocaleString()}`,

    /** `/quest active` and a bare `?quest`. */
    active: {
        title: "🗺️ Your quests",
        empty:
            "Nothing claimed right now.\n" +
            "Quests appear in the quest channel — hit **Claim** on one and progress tracks itself.",
        footer: "Progress updates on its own · you are told by DM when one finishes or ends",
        questField: (tierTitle: string, done: number, total: number) => `${tierTitle} — ${done}/${total} done`,
        questMeta: (reward: number, endsAt: Date) =>
            `🎯 **${reward.toLocaleString()}** points · ends ${relative(endsAt)}`,
        summary: (count: number, totalReward: number) =>
            `**${count}** quest${plural(count)} in progress · **${totalReward.toLocaleString()}** points on the table`,
    },

    /** `/quest board`. */
    board: {
        title: "Quest board",
        empty:
            "Nothing is open at the moment.\n\n" +
            "Quests appear at unannounced times inside the server's generation windows — " +
            "check back later, or watch the quest channel.",
        footer: "Claim from the quest's own message — progress then tracks itself.",

        status: {
            claimed: "✅ Claimed",
            vipOnly: "🔒 VIP members only",
            full: "❌ Full",
            slotBusy: "⏳ Finish your current quest of this kind first",
            open: "🟩 Open to you",
        },

        slotsUnlimited: "unlimited slots",
        slotsLeft: (left: number, total: number) => `${left}/${total} slots left`,
        link: (guildId: string, channelId: string, messageId: string) =>
            ` · [go to it](https://discord.com/channels/${guildId}/${channelId}/${messageId})`,

        questField: (tierTitle: string, reward: number) => `${tierTitle} — ${reward.toLocaleString()} points`,
        objective: (label: string) => `• ${label}`,
        questMeta: (status: string, slots: string, endsAt: Date, link: string) =>
            `${status} · ${slots} · ends ${relative(endsAt)}${link}`,
    },

    /** `/quest top`. */
    top: {
        title: "🏆 Quest leaderboard",
        medals: ["🥇", "🥈", "🥉"] as readonly string[],
        empty: "Nobody has completed a quest here yet. Be the first.",
        row: (medal: string, discordId: string, completed: number, pointsEarned: number) =>
            `${medal} <@${discordId}> — **${completed.toLocaleString()}** completed · 🎯 ${pointsEarned.toLocaleString()}`,
        fallbackMedal: (index: number) => `\`#${index + 1}\``,
        yourRank: (rank: number) => `You are #${rank}`,
        unranked: "You are not ranked yet",
    },

    /** `/quest stats` and the `/profile` quest tab. */
    stats: {
        title: (username: string) => `🗺️ Quest record — ${username}`,
        emptySelf: "You have not claimed a quest yet. `/quest board` shows what is open.",
        emptyOther: "This member has not claimed a quest yet.",

        overallField: "Overall",
        overallValue: (claimed: number, completed: number, failed: number, rate: number, active: number) =>
            `Claimed **${claimed.toLocaleString()}**\n` +
            `Completed **${completed.toLocaleString()}**\n` +
            `Failed **${failed.toLocaleString()}**\n` +
            `Completion rate **${rate}%**` +
            (active > 0 ? `\nOn **${active}** right now` : ""),

        difficultyField: "By difficulty",
        difficultyValue: (easy: number, normal: number, hard: number, golden: number, vip: number) =>
            `🟢 Easy **${easy.toLocaleString()}**\n` +
            `🔵 Normal **${normal.toLocaleString()}**\n` +
            `🟣 Hard **${hard.toLocaleString()}**\n` +
            `🌟 Golden **${golden.toLocaleString()}**\n` +
            `💎 VIP **${vip.toLocaleString()}**`,

        timingField: "Timing",
        /** `fastest` and `average` arrive already formatted — durations belong to the caller. */
        timingValue: (fastest: string, average: string, firstPlaces: number) =>
            `Fastest **${fastest}**\n` +
            `Average **${average}**\n` +
            `First to finish **${firstPlaces.toLocaleString()}×**`,
        noDuration: "—",

        rewardsField: "Rewards",
        rewardsValue: (points: number) => `🎯 **${points.toLocaleString()}** points`,

        communityField: "Community",
        communityValue: (challenges: number, contributed: number) =>
            `🌍 **${challenges.toLocaleString()}** challenges\n📈 **${contributed.toLocaleString()}** contributed`,

        rankField: "Server rank",
        rankValue: (rank: number) => `#${rank}`,
        unranked: "Unranked",

        lastCompletionFooter: "Last completion",
    },

    /** Ephemeral replies to the claim button. */
    claim: {
        guildOnly: "Quests only work in a server.",
        failure: {
            "not-found": "That quest no longer exists.",
            ended: "This quest has already ended.",
            "already-holding": "You are already on a quest of this kind. Finish it, or wait for it to expire.",
            "not-vip": "VIP quests are for members with a VIP role.",
            error: "Something went wrong claiming that. Try again in a moment.",
        } as Record<string, string>,
        full: (slotsTotal?: number | null) =>
            `Every slot was taken${slotsTotal ? ` — all ${slotsTotal} of them` : ""}.`,
        objective: (label: string) => `• ${label}`,
        claimed: (objectives: string, reward: number, endsAt: Date) =>
            `**Claimed.** Progress tracks automatically — there is nothing else to run.\n\n${objectives}\n\n` +
            `Reward: **${reward.toLocaleString()}** points · ends ${relative(endsAt)}`,
    },

    /** `/quest post` — the admin-posted Special. */
    post: {
        adminOnly: "Only a server administrator can post a Special quest.",
        buildFailed: "Could not build a Special quest — no mission templates matched. Nothing was posted.",
        title: "🎁 Special quest posted",
        objective: (index: number, label: string) => `\`${index + 1}\` ${label}`,
        rewardField: "Reward",
        rewardValue: (reward: number) => `🎯 **${reward.toLocaleString()}** points`,
        placesField: "Places",
        placesValue: (slotsTotal: number | null) => `${slotsTotal ?? "unlimited"}`,
        endsField: "Ends",
        endsValue: relative,
        footer: (
            reward: { min: number; max: number },
            slots: { min: number; max: number } | null,
        ) =>
            `Rolled from ${reward.min}–${reward.max} points` +
            (slots ? ` and ${slots.min}–${slots.max} places` : "") +
            " · anyone may claim it, even mid-quest",
    },

    /** The DMs sent when a claim resolves — the only moment the bot has anything to say about it. */
    dm: {
        unknownGuild: "the server",
        rankSuffix: ["🥇 first to finish", "🥈 second", "🥉 third"] as readonly string[],
        rankFallback: (rank: number) => `finished #${rank}`,

        completed: {
            title: "✅ Quest complete",
            description: (tierTitle: string, guildName: string, missions: string) =>
                `You finished your **${tierTitle}** quest in **${guildName}**.\n\n${missions}`,
            missionLine: (label: string) => `✅ ${label}`,
            rewardField: "Reward",
            rewardValue: (reward: number) => `🎯 **${reward.toLocaleString()}** points — already paid`,
            rankField: "Finished",
            durationField: "Took",
            footer: "That slot is free again — claim the next one whenever it appears.",
        },

        expired: {
            title: "⌛ Quest ended",
            description: (tierTitle: string, guildName: string, missions: string) =>
                `Your **${tierTitle}** quest in **${guildName}** ran out of time.\n\n${missions}`,
            missionLine: (label: string, bar: string, value: number, target: number, done: boolean) =>
                `${done ? "✅" : "▫️"} ${label}\n\`${bar}\` ${value.toLocaleString()} / ${target.toLocaleString()}`,
            progressField: "Where you got to",
            progressValue: (completed: number, total: number) => `${completed} of ${total} objective(s) done`,
            footer: "No penalty — your slot is free, so the next quest is yours to take.",
        },
    },
} as const;
