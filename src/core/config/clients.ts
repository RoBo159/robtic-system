import { GatewayIntentBits, Partials } from "discord.js";

export const BOT_DEFINITIONS: BotDefinition<GatewayIntentBits,Partials>[] = [
    {
        name: process.env.NODE_ENV === "production" ? "main" : "test",
        tokenKey: process.env.NODE_ENV === "production" ? "MainBotToken" : "TestBot",
        description: "System controller and admin bot",
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
        ],
    },
    {
        name: "support",
        tokenKey: "SupportBotToken",
        description: "Ticket and support system",
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.MessageContent,
        ],
    },
    {
        name: "moderation",
        tokenKey: "ModerationBotToken",
        description: "Moderation and punishment system",
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildModeration,
            GatewayIntentBits.MessageContent,
        ],
    },
    {
        name: "hr",
        tokenKey: "HRBotToken",
        description: "Staff management and HR automation",
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
        ],
    },
    {
        name: "modemail",
        tokenKey: "ModeMailBotToken",
        description: "Private user-staff communication",
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.MessageContent,
        ],
        partials: [
            Partials.Channel,
            Partials.Message,
        ],
    },
    {
        name: "activity",
        tokenKey: "ActivityBotToken",
        description: "XP and activity tracking",
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.MessageContent,
        ],
    },
    {
        name: "service",
        tokenKey: "ServiceBotToken",
        description: "Service tiers and membership management",
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
        ],
    },
];