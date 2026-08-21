import { QUEST_MISSION_LABELS, type QuestTier } from "@constants";
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

const TEMPLATES: MissionTemplate[] = [
    {
        key: "send-messages",
        metric: "messages",
        accumulation: "sum",
        tiers: ["easy", "normal", "hard", "golden", "vip"],
        targetFor: scaled(25),
        label: QUEST_MISSION_LABELS["send-messages"],
        community: true,
        communityTarget: () => 5_000,
    },
    {
        key: "earn-xp",
        metric: "xp",
        accumulation: "sum",
        tiers: ["easy", "normal", "hard", "golden", "vip"],
        targetFor: scaled(150),
        label: QUEST_MISSION_LABELS["earn-xp"],
        community: true,
        communityTarget: () => 50_000,
    },
    {
        key: "voice-minutes",
        metric: "voiceTime",
        accumulation: "sum",
        tiers: ["easy", "normal", "hard", "golden", "vip"],
        targetFor: tier => Math.round(15 * 60 * SCALE[tier]),
        label: QUEST_MISSION_LABELS["voice-minutes"],
        community: true,
        communityTarget: () => 100 * 60 * 60,
    },
    {
        key: "voice-xp",
        metric: "voiceXp",
        accumulation: "sum",
        tiers: ["normal", "hard", "golden", "vip"],
        targetFor: scaled(100),
        label: QUEST_MISSION_LABELS["voice-xp"],
    },
    {
        key: "combo-score",
        metric: "comboScore",
        accumulation: "max",
        tiers: ["easy", "normal", "hard", "golden"],
        targetFor: tier => Math.round(40 * SCALE[tier]),
        label: QUEST_MISSION_LABELS["combo-score"],
    },
    {
        key: "combo-heat",
        metric: "comboHeat",
        accumulation: "max",
        tiers: ["normal", "hard", "golden"],
        targetFor: tier => Math.min(100, Math.round(30 * SCALE[tier])),
        label: QUEST_MISSION_LABELS["combo-heat"],
    },
    {
        key: "reach-streak",
        metric: "streak",
        accumulation: "max",
        tiers: ["hard", "golden"],
        targetFor: tier => (tier === "golden" ? 14 : 5),
        label: QUEST_MISSION_LABELS["reach-streak"],
    },
    {
        key: "earn-points",
        metric: "pointsEarned",
        accumulation: "sum",
        tiers: ["easy", "normal", "hard", "golden", "vip"],
        targetFor: scaled(10),
        label: QUEST_MISSION_LABELS["earn-points"],
        community: true,
        communityTarget: () => 2_500,
    },
    {
        key: "level-up",
        metric: "levelUp",
        accumulation: "sum",
        tiers: ["normal", "hard", "golden"],
        targetFor: tier => (tier === "golden" ? 3 : 1),
        label: QUEST_MISSION_LABELS["level-up"],
    },
    {
        key: "community-contribution",
        metric: "communityContribution",
        accumulation: "sum",
        tiers: ["normal", "hard", "golden", "vip"],
        targetFor: scaled(20),
        label: QUEST_MISSION_LABELS["community-contribution"],
    },
];

for (const template of TEMPLATES) registerMissionTemplate(template);

export { TEMPLATES as BUILT_IN_MISSION_TEMPLATES };
