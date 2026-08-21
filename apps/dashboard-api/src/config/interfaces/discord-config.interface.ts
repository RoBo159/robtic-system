export interface DiscordConfig {
    clientId: string;
    clientSecret: string;
    /** Bot token, used to read which guilds the bot is actually in. */
    botToken: string;
}
