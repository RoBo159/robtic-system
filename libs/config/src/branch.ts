/**
 * Single source of truth for values that differ per branch/server deployment
 * of this bot system (Discord role/channel IDs, emojis, branding text).
 *
 * When standing up a new branch for a different server, this is the one
 * file to edit — everything else should read from here instead of
 * hardcoding its own copy.
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
        staffTeam: "1479440690063736892",
        fullPower: ["1362501792407228426"],
        superAdmin: "695223884735053905",
        lang: {
            en: "1480460792213274714",
            ar: "1480460771984019587",
        },
        members: "1362501805941985492",
        bots: "1362501806604943410",
        hrStaffTrainee: "1479428092304035912",

        permissionMap: {
            Owner: ["1362501793128648976"],
            LeadDev: ["1479427422280618157"],
            LeadDesign: ["1479427422741856328"],
            LeadModerator: ["1479427423484514324"],
            LeadCommunity: ["1479427423820054568"],
            LeadSupport: ["1479427424193220649"],
            StaffLead: ["1479427427196342336"],
            SeniorStaffLead: ["1479427427683012730"],
            PrincipalStaff: ["1479427428219883541"],
            DevManager: ["1479427429264003082"],
            DesignManager: ["1479427429792612352"],
            CommunityManager: ["1479427430291869870"],
            EventManager: ["1479427432376307803"],
            SupportManager: ["1479427432405536829"],
            ModerationManager: ["1479427433638920245"],
            HRManager: ["1479427436159697059"],
            ContentManager: ["1479427434528116736"],
            OperationManager: ["1479427436163764285"],
            Expert: ["1479427439888302161"],
            Professional: ["1479427444678332449"],
            Associate: ["1479428088210260069"],
            Member: ["1362501805941985492"],
        },

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
        hrResult: "1482197106868359208",
        devProjectReview: "1479465948422602982",
        devProjectLog: "1480925517317275761",
    },

    ids: {
        modmailBot: "1479554317005623509",
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
