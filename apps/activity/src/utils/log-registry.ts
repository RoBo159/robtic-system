/**
 * Display labels for each configurable log destination. Mirrors libs/constants LOG_REGISTRY —
 * duplicated here so the client bundle stays self-contained (labels are branding-neutral static text).
 */
export const LOG_LABELS: Record<string, string> = {
    guard_log: "Guard Log",
    punishments_notice: "Punishments Notice",
    report: "Reports",
    punishments_case: "Punishments Case",
    appeals_case: "Appeals Case",
    xp_gain_log: "XP Gain Log",
    rewards_log: "Rewards Log",
    support_points_log: "Support Points Log",
    staff_activity_log: "Staff Activity Log",
    decay_log: "Decay Log",
    ai_log: "AI Log",
};
