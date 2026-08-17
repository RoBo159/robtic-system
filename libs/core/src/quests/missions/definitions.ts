import type { QuestTier } from "@constants";
import { registerMissionTemplate } from "./registry";
import type { MissionTemplate } from "./types";

/**
 * The built-in mission catalogue.
 *
 * Adding a category is one entry here. Nothing in generation, progress tracking or rendering needs
 * to know the list — they all work from whatever the registry holds.
 */

/** Scales a base target by difficulty. Golden is deliberately punishing; it pays 1000. */
const SCALE: Record<QuestTier, number> = {
    easy: 1,
    normal: 2,
    hard: 5,
    golden: 15,
    vip: 2,
    special: 3,
};

const scaled = (base: number) => (tier: QuestTier): number => Math.round(base * SCALE[tier]);

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const TEMPLATES: MissionTemplate[] = [
    {
        key: "send-messages",
        metric: "messages",
        accumulation: "sum",
        tiers: ["easy", "normal", "hard", "golden", "vip"],
        targetFor: scaled(25),
        label: target => `Send ${plural(target, "message")}`,
        community: true,
        communityTarget: () => 5_000,
    },
    {
        key: "earn-xp",
        metric: "xp",
        accumulation: "sum",
        tiers: ["easy", "normal", "hard", "golden", "vip"],
        targetFor: scaled(150),
        label: target => `Earn ${target.toLocaleString()} XP`,
        community: true,
        communityTarget: () => 50_000,
    },
    {
        key: "voice-minutes",
        metric: "voiceTime",
        accumulation: "sum",
        // Seconds under the hood; the label converts. Voice is slower than chat by design.
        tiers: ["easy", "normal", "hard", "golden", "vip"],
        targetFor: tier => Math.round(15 * 60 * SCALE[tier]),
        label: target => `Spend ${plural(Math.round(target / 60), "minute")} active in voice`,
        community: true,
        communityTarget: () => 100 * 60 * 60,
    },
    {
        key: "voice-xp",
        metric: "voiceXp",
        accumulation: "sum",
        tiers: ["normal", "hard", "golden", "vip"],
        targetFor: scaled(100),
        label: target => `Earn ${target.toLocaleString()} XP in voice`,
    },
    {
        key: "combo-score",
        metric: "comboScore",
        // A level, not a counter — the member must *reach* this score in one conversation.
        accumulation: "max",
        tiers: ["easy", "normal", "hard", "golden"],
        targetFor: tier => Math.round(40 * SCALE[tier]),
        label: target => `Reach a combo score of ${target}`,
    },
    {
        key: "combo-heat",
        metric: "comboHeat",
        accumulation: "max",
        tiers: ["normal", "hard", "golden"],
        targetFor: tier => Math.min(100, Math.round(30 * SCALE[tier])),
        label: target => `Reach ${target} combo heat`,
    },
    {
        key: "reach-streak",
        metric: "streak",
        accumulation: "max",
        // Not on easy: a streak is days long, so it cannot be started and finished inside 24h.
        tiers: ["hard", "golden"],
        targetFor: tier => (tier === "golden" ? 14 : 5),
        label: target => `Reach a ${plural(target, "day")} streak`,
    },
    {
        key: "earn-points",
        metric: "pointsEarned",
        accumulation: "sum",
        tiers: ["easy", "normal", "hard", "golden", "vip"],
        targetFor: scaled(10),
        label: target => `Earn ${plural(target, "point")}`,
        community: true,
        communityTarget: () => 2_500,
    },
    {
        key: "level-up",
        metric: "levelUp",
        accumulation: "sum",
        tiers: ["normal", "hard", "golden"],
        targetFor: tier => (tier === "golden" ? 3 : 1),
        label: target => (target === 1 ? "Gain a level" : `Gain ${target} levels`),
    },
    {
        key: "community-contribution",
        metric: "communityContribution",
        accumulation: "sum",
        tiers: ["normal", "hard", "golden", "vip"],
        targetFor: scaled(20),
        label: target => `Contribute ${target} to the community challenge`,
    },
];

for (const template of TEMPLATES) registerMissionTemplate(template);

export { TEMPLATES as BUILT_IN_MISSION_TEMPLATES };
