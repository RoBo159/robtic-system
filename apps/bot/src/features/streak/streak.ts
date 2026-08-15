import { ChannelType } from "discord.js";
import { defineFeature } from "@typings/feature";

/**
 * Daily message streaks.
 *
 * `opt-in`: streaks only count in channels a guild nominates, and they post publicly, hand out a
 * role and DM members. None of that should start happening because a bot was invited.
 *
 * Six top-level commands rather than one `/streak <sub>`: every `ServerConfig.shortcuts` row and
 * every muscle-memory `!streak-top` in existing servers names them individually, and collapsing
 * them would orphan all of it.
 */
export const streakFeature = defineFeature({
    key: "streak",
    description: "Daily message streaks",
    activation: "opt-in",
    commands: [
        {
            name: "streak",
            description: "View your (or another member's) daily streak",
            scope: "guild",
            access: "general",
            category: "Streak",
            options: [
                { name: "user", description: "The user to view (defaults to yourself)", type: "user" },
            ],
        },
        {
            name: "streak-top",
            description: "View the top 5 daily streaks",
            scope: "guild",
            access: "general",
            category: "Streak",
        },        {
            name: "streak-return",
            description: "Recover your last streak, if it broke recently",
            scope: "guild",
            access: "general",
            category: "Streak",
        },
        {
            name: "streak-reward",
            description: "إدارة مكافآت التتابع",
            scope: "guild",
            access: "admin",
            category: "Streak",
            requiredPermission: 80,
            subcommands: [
                {
                    name: "add",
                    description: "إضافة أو تعديل مكافأة عند الوصول لعدد أيام معين",
                    options: [
                        { name: "number", description: "عدد أيام التتابع المطلوب", type: "integer", required: true, minValue: 1 },
                        { name: "offer", description: "وصف المكافأة", type: "string", required: true },
                    ],
                },
                {
                    name: "remove",
                    description: "إزالة مكافأة",
                    options: [
                        { name: "number", description: "عدد أيام التتابع", type: "integer", required: true, minValue: 1 },
                    ],
                },
                { name: "list", description: "عرض جميع مكافآت التتابع المُعدة" },
            ],
        },
        {
            name: "streak-config",
            description: "Configure the streak system for this server",
            scope: "guild",
            access: "admin",
            category: "Streak",
            requiredPermission: 80,
            groups: [
                {
                    name: "channel",
                    description: "Manage streak channels",
                    subcommands: [
                        {
                            name: "add",
                            description: "Add a streak channel",
                            options: [
                                { name: "channel", description: "Channel to add", type: "channel", required: true, channelTypes: [ChannelType.GuildText] },
                            ],
                        },
                        {
                            name: "remove",
                            description: "Remove a streak channel",
                            options: [
                                { name: "channel", description: "Channel to remove", type: "channel", required: true, channelTypes: [ChannelType.GuildText] },
                            ],
                        },
                        { name: "list", description: "List configured streak channels" },
                        {
                            name: "announce",
                            description: "Where streak milestones are announced (leave empty to clear)",
                            options: [
                                { name: "channel", description: "Announcement channel", type: "channel", channelTypes: [ChannelType.GuildText] },
                            ],
                        },
                    ],
                },
                {
                    name: "reminder",
                    description: "Manage streak expiry reminders",
                    subcommands: [
                        {
                            name: "default",
                            description: "Enable or disable expiry reminders for this server",
                            options: [
                                { name: "enabled", description: "Whether reminders should be sent", type: "boolean", required: true },
                            ],
                        },
                    ],
                },
            ],
            subcommands: [
                {
                    name: "settings",
                    description: "View or update streak settings",
                    options: [
                        { name: "min-length", description: "Minimum message length to count towards a streak", type: "integer", minValue: 1 },
                    ],
                },
                {
                    name: "return",
                    description: "Restore an expired streak (must be within the recovery window)",
                    options: [
                        { name: "user", description: "The user to restore", type: "user", required: true },
                    ],
                },
                {
                    name: "sync",
                    description: "Sync all streaks from another server the bot is in into this server",
                    options: [
                        { name: "source-guild-id", description: "ID of the server to copy streaks from", type: "string", required: true },
                    ],
                },
            ],
        },
    ],
    events: ["messageCreate", "guildMemberUpdate", "clientReady"],
    components: ["streak"],
});
