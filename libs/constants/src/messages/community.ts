/** Embed titles/descriptions for the community bot's activity, support, and decay logs. */
export const COMMUNITY_MESSAGES = {
    levelUpTitle: "⬆️ Level Up!",
    xpGainedTitle: "✨ XP Gained",
    levelUpDescription: (username: string, level: number) => `**${username}** reached level **${level}**!`,

    supportPointsTitle: "🎫 Support Points",
    supportPenaltyTitle: "🎫 Support Penalty",

    sessionTitles: {
        created: "📩 Support Session Created",
        claimed: "🤚 Support Session Claimed",
        resolved: "✅ Support Session Resolved",
        "auto-closed": "⏰ Support Session Auto-Closed",
        reassigned: "🔄 Support Session Reassigned",
    } as Record<string, string>,

    aiDecisionTitle: (fallback: boolean) => `🤖 AI Decision${fallback ? " (Fallback)" : ""}`,

    levelDownDecayTitle: "📉 Level Down (Decay)",
    xpDecayTitle: "📉 XP Decay",

    staffPenaltyTitle: "⚠️ Staff Support Penalty",

    staffReminderTitle: "📌 Support Channel Reminder",
    staffReminderDescription:
        "Hey! It looks like you and another staff member have been chatting in a **support channel**.\n\n" +
        "Please keep support channels focused on helping users. Use staff channels for internal discussions.",

    claimWarningTitle: "⚠️ Session Already Claimed",
    claimWarningDescription: (channelId: string) =>
        `Another staff member has already claimed the support session in <#${channelId}>.\n\n` +
        "Please do not interfere with claimed sessions. If the assigned staff is unavailable for more than **10 minutes**, the session will be automatically reassigned.",

    claimTakeoverTitle: "🔄 Session Reassigned to You",
    claimTakeoverDescription: (channelId: string, originalStaffId: string) =>
        `The previous staff member (<@${originalStaffId}>) did not respond for over **10 minutes** in <#${channelId}>.\n\n` +
        "The session has been reassigned to you. Please assist the user.",

    penaltyReasons: {
        ignoredUser: "Ignored user for 10+ minutes, session reassigned",
        intruding: (claimedBy: string) => `Intruding on session claimed by <@${claimedBy}>`,
        staffChatAfterWarning: "Continued staff-to-staff chatting after warning",
    },

    resolutionReasons: {
        aiConversationEndStaff: "AI-detected conversation end (staff)",
        memberEnded: "Member ended conversation",
        takeoverDetails: (previousStaff: string) => `Previous staff: <@${previousStaff}> (inactive >10min, -1 point)`,
    },
} as const;
