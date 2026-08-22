import { GatewayIntentBits, Partials } from "discord.js";

/**
 * The bot this system runs.
 *
 * There used to be six — main, moderation, hr, modmail, community and dev — each with its own
 * token, its own gateway connection and its own copy of the shared plumbing. They are now one
 * client running every module, so the intents and partials below are the union of what all six
 * used to ask for: dropping any of them silently disables the system that needed it.
 */
export const BOT_DEFINITION: BotDefinition<GatewayIntentBits, Partials> = {
    name: "main",
    tokenKey: process.env.NODE_ENV === "production" ? "MainBotToken" : "TestBot",
    description: "Robtic system bot — moderation, HR, modmail, community, dev and admin",
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
};

/**
 * The one Discord bot token, read exactly once, the same way, by everything that needs it — the
 * bot itself, the platform API's live role/log/promote calls, and the dashboard API's guild
 * role/channel lookups. `BOT_DEFINITION.tokenKey` is the single decision of which env var that is;
 * this is the single place that reads it and fails loudly when it is missing, so no caller can
 * silently start with an empty token.
 */
export function getMainBotToken(): string {
    const token = process.env[BOT_DEFINITION.tokenKey];
    if (!token) {
        throw new Error(
            `${BOT_DEFINITION.tokenKey} is not set — NODE_ENV=${process.env.NODE_ENV || "development"} reads that variable.`,
        );
    }

    return token;
}
