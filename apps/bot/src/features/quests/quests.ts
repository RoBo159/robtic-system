import { ChannelType } from "discord.js";
import { defineFeature } from "@typings/feature";
import { QUEST_TIERS, QUEST_LIMITS } from "@constants";

const TIER_CHOICES = QUEST_TIERS.map(tier => ({ name: tier, value: tier }));

/**
 * Quests.
 *
 * `opt-in`: a quest engine posts messages, pings roles and hands out currency on its own schedule.
 * That is not something a server should discover the bot doing — unlike points or XP, which only
 * count what was already happening.
 */
export const questsFeature = defineFeature({
    key: "quests",
    description: "Daily quests, rare challenges and a weekly community goal",
    activation: "opt-in",
    events: ["clientReady", "guildDelete"],
    components: ["quest"],
    commands: [
        {
            name: "quest",
            description: "Your quests, the board, and how you are doing",
            scope: "guild",
            access: "general",
            category: "Activity",
            subcommands: [
                { name: "board", description: "Every quest you can claim right now" },
                { name: "active", description: "The quests you are working on" },
                { name: "community", description: "This week's community challenge" },
                {
                    name: "stats",
                    description: "Quest record for you or another member",
                    options: [{ name: "user", description: "Member to check (defaults to yourself)", type: "user" }],
                },
                { name: "top", description: "Members with the most completed quests" },
            ],
        },
        {
            name: "quest-config",
            description: "Configure the quest engine",
            scope: "guild",
            access: "admin",
            category: "Configuration",
            groups: [
                {
                    name: "channel",
                    description: "Where quests are posted",
                    subcommands: [
                        {
                            name: "daily",
                            description: "Channel for easy, normal, hard and golden quests",
                            options: [{ name: "channel", description: "Target channel", type: "channel", required: true, channelTypes: [ChannelType.GuildText] }],
                        },
                        {
                            name: "community",
                            description: "Channel for the weekly community challenge",
                            options: [{ name: "channel", description: "Target channel", type: "channel", required: true, channelTypes: [ChannelType.GuildText] }],
                        },
                        {
                            name: "vip",
                            description: "Channel for VIP quests — falls back to the daily channel",
                            options: [{ name: "channel", description: "Target channel (omit to clear)", type: "channel", channelTypes: [ChannelType.GuildText] }],
                        },
                    ],
                },
                {
                    name: "mention",
                    description: "Role pinged when a quest is posted",
                    subcommands: [
                        {
                            name: "set",
                            description: "Set the role pinged for a quest type",
                            options: [
                                {
                                    name: "type",
                                    description: "Which quest type",
                                    type: "string",
                                    required: true,
                                    choices: [...TIER_CHOICES, { name: "community", value: "community" }],
                                },
                                { name: "role", description: "Role to ping (omit to clear)", type: "role" },
                            ],
                        },
                        { name: "list", description: "Show every configured mention role" },
                    ],
                },
                {
                    name: "vip-role",
                    description: "Roles that may claim VIP quests",
                    subcommands: [
                        {
                            name: "add",
                            description: "Let a role claim VIP quests",
                            options: [{ name: "role", description: "Role to allow", type: "role", required: true }],
                        },
                        {
                            name: "remove",
                            description: "Stop a role claiming VIP quests",
                            options: [{ name: "role", description: "Role to remove", type: "role", required: true }],
                        },
                        { name: "list", description: "Show the VIP roles" },
                    ],
                },
                {
                    name: "window",
                    description: "Times of day quests may appear",
                    subcommands: [
                        {
                            name: "add",
                            description: "Add or replace a generation window",
                            options: [
                                { name: "key", description: "Name for the window, e.g. morning", type: "string", required: true },
                                { name: "start-hour", description: "Local hour it opens (0-23)", type: "integer", required: true, minValue: QUEST_LIMITS.windowHour.min, maxValue: QUEST_LIMITS.windowHour.max },
                                { name: "end-hour", description: "Local hour it closes (0-23)", type: "integer", required: true, minValue: QUEST_LIMITS.windowHour.min, maxValue: QUEST_LIMITS.windowHour.max },
                            ],
                        },
                        {
                            name: "remove",
                            description: "Remove a window",
                            options: [{ name: "key", description: "Window name", type: "string", required: true, autocomplete: true }],
                        },
                        { name: "list", description: "Show the windows and the server's clock" },
                    ],
                },
                {
                    name: "tier",
                    description: "Turn individual quest types on or off",
                    subcommands: [
                        {
                            name: "toggle",
                            description: "Enable or disable a quest type here",
                            options: [
                                { name: "type", description: "Which quest type", type: "string", required: true, choices: TIER_CHOICES },
                                { name: "enabled", description: "Whether it generates", type: "boolean", required: true },
                            ],
                        },
                    ],
                },
            ],
            subcommands: [
                {
                    name: "offset",
                    description: "The server's clock, as minutes from UTC (e.g. 180 for UTC+3, 330 for UTC+5:30)",
                    options: [
                        {
                            name: "minutes",
                            description: "Minutes east of UTC",
                            type: "integer",
                            required: true,
                            minValue: QUEST_LIMITS.utcOffsetMinutes.min,
                            maxValue: QUEST_LIMITS.utcOffsetMinutes.max,
                        },
                    ],
                },
                {
                    name: "community",
                    description: "Weekly challenge settings",
                    options: [
                        { name: "enabled", description: "Whether a challenge runs each week", type: "boolean" },
                        { name: "reward", description: "Base points paid to every qualifying contributor", type: "integer", minValue: QUEST_LIMITS.communityRewardBase.min, maxValue: QUEST_LIMITS.communityRewardBase.max },
                        { name: "minimum", description: "Contribution needed to be paid at all", type: "integer", minValue: QUEST_LIMITS.communityMinContribution.min, maxValue: QUEST_LIMITS.communityMinContribution.max },
                    ],
                },
                { name: "status", description: "Show the whole quest configuration" },
            ],
        },
    ],
});
