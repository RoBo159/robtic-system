/**
 * `/quest-config` replies.
 *
 * Admin-facing, so the tone is different from `QUEST_MESSAGES`: every one of these confirms what was
 * written *and* what it means for generation, because the failure mode of this command group is an
 * engine that keeps running and quietly achieves nothing.
 */

/**
 * The parts of a stored generation window this file needs to spell out.
 *
 * Declared structurally rather than imported from `@database/models`: constants sit under the
 * database layer, not above it, and `IQuestWindow` satisfies this shape as it stands.
 */
interface QuestWindowShape {
    key: string;
    startHour: number;
    endHour: number;
    enabled: boolean;
}

/** "UTC+05:30". Minutes east of UTC, because +05:45 exists and nothing here models timezones. */
export const utcClock = (minutes: number): string => {
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};

const hourRange = (startHour: number, endHour: number): string =>
    `${String(startHour).padStart(2, "0")}:00 → ${String(endHour).padStart(2, "0")}:00`;

/**
 * A tuning value that may be fixed or rolled — `QuestRange` restated locally.
 *
 * Spelling the range out matters for Special, whose reward, mission count and places are all ranges:
 * interpolating one directly reads as `[object Object]`.
 */
type RangeLike = number | { min: number; max: number };

const range = (value: RangeLike): string =>
    typeof value === "number"
        ? value.toLocaleString()
        : `${value.min.toLocaleString()}–${value.max.toLocaleString()}`;

export const QUEST_CONFIG_MESSAGES = {
    utcClock,

    channel: {
        daily: (mention: string | null) => `Easy, normal, hard and golden quests will be posted in ${mention}.`,
        community: (mention: string | null) =>
            `The weekly community challenge will be posted in ${mention}.\n` +
            "The panel is posted once and edited all week — it is worth a channel members can find.",
        vip: (mention: string | null) =>
            mention
                ? `VIP quests will be posted in ${mention}.`
                : "VIP channel cleared — VIP quests will go to the daily quest channel.",
    },

    mention: {
        communityLabel: "🌍 Community",
        set: (label: string, roleId: string) => `${label} quests will ping <@&${roleId}>.`,
        cleared: (label: string) => `${label} quests will no longer ping anyone.`,
        listTitle: "Quest mention roles",
        listRow: (label: string, roleId: string | null) => `${label} — ${roleId ? `<@&${roleId}>` : "*no ping*"}`,
    },

    vipRole: {
        added: (roleId: string, count: number) =>
            `<@&${roleId}> can now claim VIP quests — ${count} VIP role(s) configured.`,
        removed: (roleId: string) => `<@&${roleId}> can no longer claim VIP quests.`,
        removedLast: (roleId: string) => `<@&${roleId}> removed. With no VIP roles left, nobody can claim VIP quests.`,
        listTitle: "VIP roles",
        listRow: (roleId: string) => `• <@&${roleId}>`,
        listEmpty:
            "No VIP roles configured, so VIP quests cannot be claimed by anyone.\n" +
            "Add one with `/quest-config vip-role add`.",
    },

    window: {
        unusableKey: "That name has no usable characters — try something like `morning`.",
        tooMany: (max: number) => `This server already has ${max} windows — remove one before adding another.`,
        describe: (window: QuestWindowShape) =>
            `**${window.key}** — ${hourRange(window.startHour, window.endHour)}` +
            (window.endHour <= window.startHour ? " *(overnight)*" : "") +
            (window.enabled ? "" : " *(disabled)*"),
        saved: (existed: boolean, described: string) =>
            `${existed ? "Updated" : "Added"} window ${described}\n` +
            "Quests appear at an unannounced minute inside it — the same minute for the whole server, " +
            "different for every other server.",
        notFound: (key: string) => `No window called **${key}**. \`/quest-config window list\` shows them.`,
        removed: (key: string) => `Removed **${key}**.`,
        removedLast: (key: string) => `Removed **${key}**. With no windows left, no daily quests will be generated.`,
        listTitle: "Quest generation windows",
        listEmpty: "No windows configured — no daily quests will be generated.",
        listFooter: (clock: string) => `Hours are read in ${clock} · change it with /quest-config offset`,
    },

    tier: {
        cadenceDaily: (min: number, max: number) => `${min}–${max} per day`,
        cadenceWeekly: (min: number, max: number) => `${min}–${max} per week`,
        cadencePerWindow: "one per generation window",
        slotsUnlimited: "unlimited claims",
        slots: (slots: RangeLike) => `${range(slots)} claim slot(s)`,
        enabled: (tierTitle: string, cadence: string, missions: RangeLike, reward: RangeLike, slots: string) =>
            `${tierTitle} quests are on — ${cadence}, ${range(missions)} mission(s), ` +
            `${range(reward)} points, ${slots}.`,
        disabled: (tierTitle: string) =>
            `${tierTitle} quests are off. Any that are already live will finish normally.`,
    },

    offset: {
        /** `localNow` is the bot's own idea of the wall clock, so an admin can sanity-check it. */
        saved: (clock: string, localNow: string) =>
            `Quest windows are now read in **${clock}** — that makes it **${localNow}** here.\n` +
            "Existing windows keep their hours; they just land at different real times.",
    },

    community: {
        title: "Weekly community challenge",
        description: (enabled: boolean, reward: number, minimum: number, rankBonus: string) =>
            `**Running:** ${enabled ? "yes, a new one opens each week" : "no"}\n` +
            `**Base reward:** ${reward.toLocaleString()} points per qualifying contributor\n` +
            `**Minimum contribution:** ${minimum.toLocaleString()}\n` +
            `**Rank bonus:** ${rankBonus}`,
        footer: "A challenge already under way keeps the numbers it started with.",
    },

    status: {
        title: "Quest configuration",
        notSet: "*not set*",
        none: "*none*",
        noRole: "—",
        communityLabel: "🌍 Community",

        channelsField: "Channels",
        channelsValue: (daily: string, community: string, vip: string) =>
            `Daily — ${daily}\nCommunity — ${community}\nVIP — ${vip}`,
        vipFallsBack: "*falls back to daily*",

        mentionsField: "Mentions",
        mentionRow: (label: string, roleId: string | null) => `${label} — ${roleId ? `<@&${roleId}>` : "—"}`,

        difficultiesField: "Difficulties",
        difficultyRow: (enabled: boolean, tierTitle: string) => `${enabled ? "✅" : "🚫"} ${tierTitle}`,

        windowsField: (clock: string) => `Windows (${clock})`,
        windowRow: (window: QuestWindowShape) =>
            `${window.enabled ? "•" : "○"} **${window.key}** ${hourRange(window.startHour, window.endHour)}`,

        vipRolesField: "VIP roles",

        communityField: "Community challenge",
        communityOn: (reward: number, minimum: number) =>
            `On · ${reward.toLocaleString()} points base · min ${minimum.toLocaleString()}`,
        communityOff: "Off",

        warningsField: "⚠️ Needs attention",
        warningRow: (line: string) => `• ${line}`,
        warnings: {
            noDailyChannel: "No daily channel — generated quests are posted nowhere.",
            noCommunityChannel: "No community channel — the weekly challenge runs unseen.",
            noVipRoles: "No VIP roles — VIP quests are posted but nobody can claim them.",
            noWindows: "No enabled windows — nothing will be generated at all.",
        },
    },
} as const;
