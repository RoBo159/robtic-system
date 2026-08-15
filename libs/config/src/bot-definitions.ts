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
        // Voice activity cannot see anyone without this — no join/leave events, no channel
        // membership, so no session tracking at all.
        GatewayIntentBits.GuildVoiceStates,
        // Reactions count as presence for AFK detection.
        GatewayIntentBits.GuildMessageReactions,
    ],
    // Reaction, so a reaction on a message the bot never cached still reports who added it.
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
};
