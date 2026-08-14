/** Every log destination configurable via /setup-log, keyed by the identifier stored in LogConfig. */
export const LOG_REGISTRY = {
    guard_log: { label: "Guard Log", description: "Security and guild guard events" },
    punishments_notice: { label: "Punishments Notice", description: "Executed punishment notices" },
    report: { label: "Reports", description: "User-submitted reports" },
    punishments_case: { label: "Punishments Case", description: "Punishment approval workflow" },
    appeals_case: { label: "Appeals Case", description: "Appeal case handling" },
    xp_gain_log: { label: "XP Gain Log", description: "XP gains and level-up events" },
    rewards_log: { label: "Rewards Log", description: "Reward distribution events" },
    support_points_log: { label: "Support Points Log", description: "Support staff point events" },
    staff_activity_log: { label: "Staff Activity Log", description: "Staff activity events" },
    decay_log: { label: "Decay Log", description: "XP decay events" },
    ai_log: { label: "AI Log", description: "AI decision logging" },
} as const;

export type LogKey = keyof typeof LOG_REGISTRY;
