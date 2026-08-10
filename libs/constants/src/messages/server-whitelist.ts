/** Replies from `/addserver` and `/removeserver`, which manage the guild whitelist the guard enforces. */
export const SERVER_WHITELIST_MESSAGES = {
    invalidId: (value: string) => `\`${value}\` is not a valid server id. Paste the 17–20 digit id from Discord's "Copy Server ID".`,
    added: (guildId: string, name?: string) =>
        `✅ Added **${name ?? guildId}** (\`${guildId}\`) to the server whitelist. The bot may now be invited to it and will stay.`,
    alreadyAdded: (guildId: string) => `\`${guildId}\` is already on the server whitelist.`,
    removed: (guildId: string) =>
        `✅ Removed \`${guildId}\` from the server whitelist. The bot will leave it the next time it starts or is invited back.`,
    notListed: (guildId: string) => `\`${guildId}\` is not on the server whitelist.`,
    cannotRemoveCurrent: "This is the server you're running the command in — remove it from somewhere else, or the bot will leave mid-command.",
} as const;
