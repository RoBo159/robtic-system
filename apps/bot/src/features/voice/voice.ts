import { ChannelType } from "discord.js";
import { defineFeature } from "@typings/feature";
import { VOICE_LIMITS } from "@constants";

const CHANNEL_OPTION = {
    name: "channel",
    description: "Voice channel",
    type: "channel",
    required: true,
    channelTypes: [ChannelType.GuildVoice, ChannelType.GuildStageVoice],
} as const;

/**
 * Voice activity: XP and Points for time spent actually participating in voice.
 *
 * Feeds the existing level system rather than a parallel one — a level is a level however it was
 * earned. `opt-in`, because it rewards members automatically and starts tracking who was in which
 * channel and for how long, which a server should choose rather than inherit.
 */
export const voiceFeature = defineFeature({
    key: "voice",
    description: "Voice activity XP and time tracking",
    activation: "opt-in",
    commands: [
        {
            name: "voice",
            description: "Voice activity — your time, the leaderboards, and the settings",
            scope: "guild",
            access: "general",
            category: "Activity",
            groups: [
                {
                    name: "config",
                    description: "Configure voice activity (admins only)",
                    subcommands: [
                        { name: "view", description: "Show the current voice settings" },
                        {
                            name: "toggle",
                            description: "Turn voice rewards on or off",
                            options: [{ name: "enabled", description: "Whether voice earns anything", type: "boolean", required: true }],
                        },
                        {
                            name: "track",
                            description: "Only these channels earn. None listed means all of them.",
                            options: [CHANNEL_OPTION, { name: "remove", description: "Remove it instead of adding", type: "boolean" }],
                        },
                        {
                            name: "exclude",
                            description: "These channels never earn",
                            options: [CHANNEL_OPTION, { name: "remove", description: "Remove it instead of adding", type: "boolean" }],
                        },
                        {
                            name: "rates",
                            description: "Alone multiplier and AFK timeout",
                            options: [
                                {
                                    name: "alone-multiplier",
                                    description: "Share of the reward when alone, as a percentage (25 = a quarter)",
                                    type: "integer",
                                    minValue: VOICE_LIMITS.aloneMultiplier.min * 100,
                                    maxValue: VOICE_LIMITS.aloneMultiplier.max * 100,
                                },
                                {
                                    name: "afk-minutes",
                                    description: "Minutes of inactivity before voice rewards stop",
                                    type: "integer",
                                    minValue: VOICE_LIMITS.afkTimeoutMinutes.min,
                                    maxValue: VOICE_LIMITS.afkTimeoutMinutes.max,
                                },
                            ],
                        },
                    ],
                },
            ],
            subcommands: [
                {
                    name: "stats",
                    description: "Voice time, XP and sessions",
                    options: [{ name: "user", description: "Member to check (defaults to yourself)", type: "user" }],
                },
                {
                    name: "top",
                    description: "Voice leaderboard",
                    options: [
                        {
                            name: "board",
                            description: "Which board",
                            type: "string",
                            choices: [
                                { name: "total time", value: "total" },
                                { name: "weekly time", value: "weekly" },
                                { name: "monthly time", value: "monthly" },
                                { name: "voice xp", value: "xp" },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
    events: ["voiceStateUpdate", "clientReady"],
});
