/** Labels and copy for the `!help` command (overview + category dropdown). */
export const HELP = {
    /** Category bucket for commands that declare no `category`. Always sorted first. */
    generalCategory: "General",
    overviewSelectLabel: "🏠 Overview",
    overviewSelectValue: "__overview__",
    selectCustomId: "help:category",
    selectPlaceholder: "📂 Select a command category…",
    title: (botName: string) => `📖 ${botName} — Command Help`,
    categoryTitle: (botName: string, category: string) => `📖 ${botName} — ${category}`,
    intro: (prefix: string) =>
        `Every command works two ways: type \`${prefix}command\` in chat, or use \`/command\`.\n` +
        `Get a command wrong (e.g. a missing argument) and I'll reply with its correct usage.`,
    categoriesLine: (categories: string[]) => `**Categories:** ${categories.join(" • ")}`,
    pickPrompt: "Use the menu below to browse a category's commands and their usage.",
    slashOnlyNote: (prefix: string, name: string) => `⚠️ Slash only — use \`/${name}\` (opens a form).`,
    footer: (count: number) => `${count} command${count === 1 ? "" : "s"} • ! or / both work`,
    emptyCategory: "No commands in this category.",
    noCommands: "No commands are available here.",

    featuresHeading: "**Features:**",
    featureOn: (key: string) => `🟢 ${key}`,
    featureOff: (key: string) => `⚪ ${key}`,
    featuresHint: (prefix: string) => `Greyed features are switched off here — an admin can turn one on with \`${prefix}feature enable <name>\`.`,
    /** Appended to a command whose feature is switched off in this server. */
    disabledNote: "⚪ Its feature is off in this server.",
    adminOnlyCategory: "Admin",

    categoryCount: (name: string, count: number) => `${name} \`${count}\``,
    detailHint: (prefix: string) => `Want one command in full? \`${prefix}help <command>\` lists every form of it.`,
    /** Shown under a command that has subcommands, instead of listing all of them. */
    subcommandCount: (count: number) => `${count} subcommand${count === 1 ? "" : "s"}`,
    commandTitle: (botName: string, name: string) => `📖 ${botName} — /${name}`,
    unknownCommand: (input: string, prefix: string) =>
        `No command called \`${input}\`. Use \`${prefix}help\` to browse what exists.`,
    pageFooter: (page: number, pages: number, count: number) =>
        `Page ${page}/${pages} • ${count} command${count === 1 ? "" : "s"} • ! or / both work`,
    prevButton: "◀ Prev",
    nextButton: "Next ▶",
    prevCustomId: "help:prev",
    nextCustomId: "help:next",
    /** A category whose commands could not all fit even after paging. */
    truncatedNote: (dropped: number) => `…and ${dropped} more — narrow it down with \`help <command>\`.`,

    // `help <command>` answers in plain text rather than an embed — see buildCommandHelpText.
    textCommandLine: (invocation: string) => `**Command:** \`${invocation}\``,
    textShortcutLine: (triggers: string) => `**Shortcut:** ${triggers}`,
    textUsageHeading: "**Usage:**",
    noShortcuts: "*none configured*",
    /** Discord's message-content ceiling, which the text view is budgeted against. */
    textLimit: 2000,
} as const;

/** Per-category emoji for the help dropdown/embeds; falls back to 📁. */
export const HELP_CATEGORY_EMOJI: Record<string, string> = {
    General: "📋",
    Streak: "🔥",
    Economy: "🪙",
    Activity: "💬",
    Profile: "🪪",
    Leaderboard: "🏆",
    Leveling: "📈",
    Moderation: "🛡️",
    Tickets: "🎫",
    Partnership: "🤝",
    Projects: "🚀",
    Minecraft: "⛏️",
    Configuration: "⚙️",
    Admin: "🔑",
    Utility: "🧰",
};

/** Static content of the moderation command-reference embed. */
export const MODERATION_HELP = {
    title: "🛡️ Moderation Command Reference",
    fields: [
        {
            name: "Warnings",
            value: [
                "`/warn add @user <reason>` — Issue a warning (reason from dropdown)",
                "`/warn appeal @user <case>` — Appeal a warning (removes level points)",
                "`/warn list @user` — List all warnings",
            ].join("\n"),
        },
        {
            name: "Mutes",
            value: [
                "`/mute add @user <reason> [duration]` — Mute a user",
                "`/mute remove @user <case>` — Unmute (keeps level)",
                "`/mute appeal @user <case>` — Appeal (removes level points)",
                "`/mute list @user` — List all mutes",
            ].join("\n"),
        },
        {
            name: "Jail (punishment system)",
            value: [
                "`/jail add @user <reason> [permanent] [duration]` — Jail a user (case + level + timeout)",
                "`/jail remove @user <case>` — Release (keeps level)",
                "`/jail appeal @user <case>` — Appeal (removes level points)",
                "`/jail list @user` — List all jail cases",
            ].join("\n"),
        },
        {
            name: "Server Actions",
            value: [
                "`/ban @user [reason]` — Ban from the server (Discord ban list, no case record)",
                "`/unban <user id> [reason]` — Lift a server ban",
                "`/kick @user [reason]` — Kick from the server",
            ].join("\n"),
        },
        {
            name: "Roles",
            value: [
                "`/roles` — List every role on the server",
                "`/role give @user <role>` — Give a role",
                "`/role remove @user <role>` — Take a role away",
                "`/role multirole @user <role1> <role2> [role3] [role4] [role5]` — Give several at once",
                "Roles at or above your own highest role can't be handed out.",
            ].join("\n"),
        },
        {
            name: "Reason Management",
            value: [
                "`/reason create <type>` — Create a new punishment reason (Manager+)",
                "`/reason remove <key>` — Remove a punishment reason (Manager+)",
                "`/reason list` — List all punishment reasons",
            ].join("\n"),
        },
        {
            name: "Tickets",
            value: [
                "`/ticket-panel <channel>` — Send the ticket-opening panel (Manager+)",
                "`/claim` — Claim the current ticket (staff only, in-ticket)",
                "`/rename <name>` — Rename the current ticket (staff only, in-ticket)",
                "`/add @user` — Add a user to the current ticket (staff only, in-ticket)",
                "`/remove @user` — Remove a user from the current ticket (staff only, in-ticket)",
                "`/escalate` — Grant the category's admin role access (staff only, in-ticket)",
                "`/close [reason]` — Close the current ticket and award category points (staff only, in-ticket)",
                "",
                "Categories, roles, and staff points are configured in `apps/bot/src/config/moderation/ticket.ts`.",
            ].join("\n"),
        },
        {
            name: "Punishment System",
            value: [
                "Each punishment adds points to a user's level:",
                "• **Warn**: +5 points | **Mute**: +10 points | **Ban**: +20 points",
                "",
                "**Level Thresholds:**",
                "• `20` — Warning role",
                "• `40` — Final Warning role",
                "• `60` — Temporary Mute (auto-mute)",
                "• `80` — Temporary Ban",
                "• `100` — Permanent Ban (role assigned)",
                "",
                "**Escalation:** Associate-level mods' punishments are sent for Expert+ approval.",
            ].join("\n"),
        },
    ],
} as const;
