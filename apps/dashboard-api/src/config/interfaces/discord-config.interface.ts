export interface DiscordConfig {
    clientId: string;
    clientSecret: string;
    /** The same bot token the bot process and the platform API use — see libs/config's `getMainBotToken`. */
    botToken: string;
}
