/** Static user-facing text shared across every bot module. */
export const SHARED_MESSAGES = {
    errorEmbedTitle: "❌ Error",
    errorEmbedFooter: "Please contact support if you think this shouldn't happen.",
} as const;

/** Replies produced by the shared interaction pipeline (permission/cooldown/component checks). */
export const INTERACTION_MESSAGES = {
    staleComponent: "This action is no longer available. Please try again.",
    guildOnlyCommand: "This command can only be used in a server.",
    noPermission: "You don't have permission to use this command.",
    superUserOnly: "This is a bot-owner command. Only super users can run it.",
    serverAdminOnly: "Only server administrators, or a role added with /command-access admin-roles, can use this command.",
    featureDisabled: (description: string, key: string) =>
        `${description} is not enabled in this server. An administrator can turn it on with \`/feature enable ${key}\`.`,
    cooldownWait: (remainingSeconds: number) => `Please wait ${remainingSeconds}s before using this command again.`,
} as const;
