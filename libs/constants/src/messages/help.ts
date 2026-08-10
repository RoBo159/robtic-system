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
    Tags: "🏷️",
    Threads: "📨",
    Staff: "👔",
    Partnership: "🤝",
    Projects: "🚀",
    Minecraft: "⛏️",
    Configuration: "⚙️",
    Admin: "🔑",
    Utility: "🧰",
};

/** Static content of the ModMail command-reference embed. */
export const MODMAIL_HELP = {
    title: "📖 ModMail Command Reference",
    fields: [
        {
            name: "Thread Management",
            value: [
                "`/thread close` — Close the current modmail thread",
                "`/thread stop` — Pause the conversation (claimer only)",
                "`/thread start` — Resume a paused conversation (claimer only)",
                "`/thread reopen` — Reopen a closed thread (managers only)",
                "`/thread status` — Display all active and closed threads",
            ].join("\n"),
        },
        {
            name: "Communication",
            value: [
                "`!reply <message>` — Send a message to the user",
                "`/transfer @staff` — Transfer the thread to another staff member",
            ].join("\n"),
        },
        {
            name: "Tags",
            value: [
                "`!tag` — List all available tags",
                "`!tag <key>` — Send a tag message to the user",
                "`/tag create` — Create a new tag",
                "`/tag delete` — Delete an existing tag",
                "`/tag help` — Show tag usage and template variables",
            ].join("\n"),
        },
        {
            name: "Notes",
            value: [
                "`!note` — View notes for the thread user",
                "📝 **Notes** button — View notes from the info embed",
            ].join("\n"),
        },
        {
            name: "Info",
            value: [
                "✋ **Claim** button — Claim the thread to handle it",
                "🔒 **Close** button — Close the thread from the info embed",
            ].join("\n"),
        },
    ],
} as const;

/** Static content of the tag-system guide embed; tag/variable lists are appended at render time. */
export const TAG_HELP = {
    title: "📋 Tag System Guide",
    usageFieldName: "Usage",
    usageFieldValue: "`!tag` — List all tags\n`!tag <key>` — Send a tag to the user\n`/tag create` — Create a new tag\n`/tag delete` — Delete a tag",
    availableTagsFieldName: "Available Tags",
    templateVariablesFieldName: "Template Variables",
} as const;

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
