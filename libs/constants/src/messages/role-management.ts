/** Replies from `/ban`, `/unban`, `/role` and `/roles`. */
export const MODERATION_ACTION_MESSAGES = {
    guildOnly: "This command can only be used in a server.",
    selfTarget: (action: string) => `You cannot ${action} yourself.`,
    botTarget: (action: string) => `You cannot ${action} me.`,
    notInGuild: "That member isn't in this server.",
    invalidUserId: (value: string) => `\`${value}\` is not a valid user id or mention.`,

    banMissingPermission: "I'm missing the **Ban Members** permission.",
    banNotBannable: "I can't ban that member — their highest role is above mine.",
    banAboveExecutor: "You can't ban someone whose highest role is at or above your own.",
    banned: (userTag: string, userId: string, reason: string) => `🔨 Banned **${userTag}** (\`${userId}\`) — ${reason}`,
    banFailed: "The ban failed. Check my role position and permissions.",
    alreadyBanned: (userId: string) => `\`${userId}\` is already banned.`,

    unbanNotBanned: (userId: string) => `\`${userId}\` is not on this server's ban list.`,
    unbanned: (userTag: string, userId: string, reason: string) => `✅ Unbanned **${userTag}** (\`${userId}\`) — ${reason}`,
    unbanFailed: "The unban failed. Check my **Ban Members** permission.",

    kickMissingPermission: "I'm missing the **Kick Members** permission.",

    rolesMissingPermission: "I'm missing the **Manage Roles** permission.",
    roleUnmanageable: (roleName: string) => `**${roleName}** is above my highest role, so I can't assign it.`,
    roleManagedByIntegration: (roleName: string) => `**${roleName}** is managed by an integration or is the server booster role, so it can't be assigned manually.`,
    roleAboveExecutor: (roleName: string) => `**${roleName}** is at or above your highest role, so you can't hand it out.`,
    roleEveryone: "The @everyone role can't be given or removed.",
    roleAlreadyHas: (userTag: string, roleName: string) => `**${userTag}** already has **${roleName}**.`,
    roleDoesNotHave: (userTag: string, roleName: string) => `**${userTag}** doesn't have **${roleName}**.`,
    roleGiven: (userTag: string, roleName: string) => `✅ Gave **${roleName}** to **${userTag}**.`,
    roleRemoved: (userTag: string, roleName: string) => `✅ Removed **${roleName}** from **${userTag}**.`,
    roleFailed: "Discord rejected the role change. Check my role position and permissions.",

    multiroleNone: "None of those roles could be given — see the reasons above.",
    multiroleResult: (userTag: string, applied: string[], skipped: string[]) => {
        const lines = [`✅ Gave **${applied.length}** role(s) to **${userTag}**: ${applied.join(", ")}`];
        if (skipped.length) lines.push(`⚠️ Skipped: ${skipped.join(" • ")}`);
        return lines.join("\n");
    },

    rolesListTitle: (guildName: string) => `🎭 Roles — ${guildName}`,
    rolesListFooter: (shown: number, total: number) =>
        shown === total ? `${total} role(s)` : `Showing ${shown} of ${total} role(s) — too many to display in full`,
    rolesListEmpty: "This server has no roles besides @everyone.",
} as const;
