/**
 * Every auditable staff action. One flat list drives three things at once: the plugin's log calls,
 * the API's validation, and the colour and title of the Discord embed — so adding an action means
 * touching this file and nothing else.
 */
export const STAFF_ACTIONS = [
    "staff_enabled",
    "staff_disabled",
    "freeze",
    "unfreeze",
    "jail",
    "release",
    "teleport",
    "inventory_inspect",
    "enderchest_inspect",
    "player_report",
    "report_accepted",
    "report_closed",
    "report_dismissed",
    "staff_added",
    "staff_promoted",
    "staff_demoted",
    "staff_role_changed",
    "staff_fired",
    "warning_added",
    "warning_removed",
    "note_added",
    "role_sync",
    "player_linked",
    "player_unlinked",
    "coins_sold",
    "server_started",
    "server_stopped",
    "plugin_loaded",
    "plugin_error",
    "api_error",
    "auth_failure",
] as const;

export type StaffAction = typeof STAFF_ACTIONS[number];

/**
 * Severity band per action, which is what the embed colour is chosen from. Keeping the mapping
 * here rather than in the embed builder means the bot and any future dashboard agree on it.
 */
export const STAFF_ACTION_SEVERITY: Record<StaffAction, "info" | "success" | "warning" | "danger"> = {
    report_accepted: "info",
    report_closed: "success",
    report_dismissed: "warning",
    staff_added: "success",
    staff_promoted: "success",
    staff_demoted: "warning",
    staff_role_changed: "info",
    staff_fired: "danger",
    staff_enabled: "info",
    staff_disabled: "info",
    freeze: "warning",
    unfreeze: "success",
    jail: "danger",
    release: "success",
    teleport: "info",
    inventory_inspect: "info",
    enderchest_inspect: "info",
    player_report: "warning",
    warning_added: "warning",
    warning_removed: "success",
    note_added: "info",
    role_sync: "info",
    player_linked: "success",
    player_unlinked: "warning",
    coins_sold: "info",
    server_started: "success",
    server_stopped: "warning",
    plugin_loaded: "info",
    plugin_error: "danger",
    api_error: "danger",
    auth_failure: "danger",
};

/** Counters kept per staff member, derived from the actions above. */
export const STAFF_STAT_KEYS = [
    "freezes",
    "jails",
    "teleports",
    "inspections",
    "reportsResolved",
    "warningsIssued",
    "notesWritten",
    "commandsUsed",
] as const;

export type StaffStatKey = typeof STAFF_STAT_KEYS[number];

/** Which counter an action increments; actions absent from this map increment nothing. */
export const STAFF_ACTION_STAT: Partial<Record<StaffAction, StaffStatKey>> = {
    freeze: "freezes",
    jail: "jails",
    teleport: "teleports",
    inventory_inspect: "inspections",
    enderchest_inspect: "inspections",
    warning_added: "warningsIssued",
    note_added: "notesWritten",
};
