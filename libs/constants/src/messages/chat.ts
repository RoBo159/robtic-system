/** Replies from `/chat` and the channel-utility shortcuts behind it. */
export const CHAT_MESSAGES = {
    guildChannelOnly: "This command can only be used in a server channel.",
    unknownSubcommand: "Unknown subcommand.",
    actionFailed: "An error occurred while executing the command. Please check my permissions.",
} as const;
