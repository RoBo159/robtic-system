/**
 * Values that differ per branch/server deployment of this bot system (Discord role/channel IDs,
 * emojis, branding text).
 *
 * The permission chain no longer reads from here: staff ranks are per-guild StaffTier rows, server
 * operators are resolved from Discord's own ownership/Administrator permission (isGuildOperator),
 * and the bot owner comes from the BOT_OWNER_ID environment variable. What remains is the set of
 * subsystems still pinned to one server — punishments, language roles, tickets and the rules panel.
 * Each is per-guild work still to be done, tracked in docs/architecture.md.
 */
export const BRANCH_CONFIG = {
    server: {
        name: "Robtic",
        fullName: "Robtic Server",
        url: "https://robtic.org",
        statusTargetHost: "core.robtic.org",
        githubAssetsBase: "https://raw.githubusercontent.com/RoBo159/assets/refs/heads/main",
    },

    roles: {
        lang: {
            en: "1480460792213274714",
            ar: "1480460771984019587",
        },
        members: "1362501805941985492",
        bots: "1362501806604943410",

        /** Ticket access roles — see apps/bot/src/config/moderation/ticket.ts. */
        ticketSupport: "1479440690063736892",
        ticketAdmin: "1479427432405536829",

        memberPunishments: {
            warn: "1479443342390591528",
            fWarn: "1479486532405559409",
            tempMute: "1479486539238211859",
            tempBan: "1479486531784937542",
            permBan: "1479486653788848271",
        },

        staffPunishments: [
            "1479440695101227169",
            "1479440695533244559",
            "1479440696459919472",
            "1479440696967434313",
            "1479440697357635584",
        ],
    },

    channels: {
        generalChat: ["1479233532592390315", "1515971805481799770"],
        ticketCategory: "1486500136585789453",
        ticketSupportReport: "1479467031546826833",
        devProjectReview: "1479465948422602982",
        devProjectLog: "1480925517317275761",
    },

    emojis: {
        ticketManager: "<:4manager:1479437342983983185>",
        membersPanelButton: "1480426683570983014",
    },

    /** Rotated by setPresence on the single bot client — one list covering every system it now runs. */
    presence: [
        "Developer support system 🔥",
        "Debugging code with devs ⚙️",
        "Learning resources hub 📚",
        "Helping with dev projects 🚀",
        "Tracking community activity 📊",
        "Leveling up members ⬆️",
        "Monitoring staff performance 🏆",
        "Moderation automation active 🛡️",
        "DM for moderation help 📨",
        "Processing staff applications ⚙️",
        "Code review and sharing 🧪",
    ],

    partnership: {
        /** Standard partner role name, granted in every branch — same across all branches. */
        roleName: "partner",
    },
};
