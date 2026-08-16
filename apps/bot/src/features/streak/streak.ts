import { ChannelType } from "discord.js";
import { defineFeature } from "@typings/feature";
import { STREAK_LIMITS } from "@constants";

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
            // access "general" so assigned roles can reach the handler; the handler itself gates on
            // administrator-or-assigned-role. Declaring "admin" here would lock those roles out
            // before any of our code ran.
            name: "streak-return",
            description: "Give a member their expired streak back (staff only)",
            scope: "guild",
            access: "general",
            category: "Streak",
            options: [
                { name: "user", description: "The member whose streak to return", type: "user", required: true },
            ],
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
                {
                    name: "return-role",
                    description: "Roles that may return a streak, besides administrators",
                    subcommands: [
                        {
                            name: "add",
                            description: "Let a role return streaks",
                            options: [{ name: "role", description: "Role to allow", type: "role", required: true }],
                        },
                        {
                            name: "remove",
                            description: "Stop a role returning streaks",
                            options: [{ name: "role", description: "Role to remove", type: "role", required: true }],
                        },
                        { name: "list", description: "Show the roles that may return streaks" },
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
                    name: "windows",
                    description: "How long a streak lasts, and how long staff can give it back",
                    options: [
                        {
                            name: "claim-days",
                            description: "Days between claims — 1 means daily",
                            type: "integer",
                            minValue: STREAK_LIMITS.claimDays.min,
                            maxValue: STREAK_LIMITS.claimDays.max,
                        },
                        {
                            name: "expire-days",
                            description: "Days without a claim before the streak dies — must exceed claim-days",
                            type: "integer",
                            minValue: STREAK_LIMITS.expireDays.min,
                            maxValue: STREAK_LIMITS.expireDays.max,
                        },
                        {
                            name: "return-hours",
                            description: "Hours after expiry that staff can still return it",
                            type: "integer",
                            minValue: STREAK_LIMITS.returnWindowHours.min,
                            maxValue: STREAK_LIMITS.returnWindowHours.max,
                        },
                    ],
                },
                {
                    name: "break-on",
                    description: "Which punishments end a streak",
                    options: [
                        { name: "timeout", description: "A timeout ends it — this covers /mute, /jail and warn auto-mutes", type: "boolean" },
                        { name: "kick", description: "Being kicked ends it", type: "boolean" },
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
