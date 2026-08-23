import { GatewayIntentBits, Partials } from "discord.js";

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

export function getMainBotToken(): string {
    const token = process.env[BOT_DEFINITION.tokenKey];
    if (!token) {
        throw new Error(
            `${BOT_DEFINITION.tokenKey} is not set — NODE_ENV=${process.env.NODE_ENV || "development"} reads that variable.`,
        );
    }

    return token;
}
