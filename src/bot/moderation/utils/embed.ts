// Centralized embed builders for moderation events
import { EmbedBuilder } from "discord.js";
import { Colors } from "@core/config";

import type { GuildMember, GuildBan, Message, GuildChannel, Role } from "discord.js";

export function memberJoinEmbed(member: GuildMember) {
    return new EmbedBuilder()
        .setTitle("📘 Audit: Member Joined")
        .setColor(Colors.success)
        .addFields(
            { name: "User", value: `<@${member.id}> (${member.id})` },
            { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` },
        )
        .setTimestamp();
}

export function memberLeaveEmbed(member: GuildMember) {
    return new EmbedBuilder()
        .setTitle("📘 Audit: Member Left")
        .setColor(Colors.warning)
        .addFields(
            { name: "User", value: `<@${member.id}> (${member.id})` },
        )
        .setTimestamp();
}

export function memberKickEmbed(member: GuildMember, executorId: string, reason: string) {
    return new EmbedBuilder()
        .setTitle("📘 Audit: Member Kicked")
        .setColor(Colors.warning)
        .addFields(
            { name: "Target", value: `<@${member.id}> (${member.id})` },
            { name: "Executor", value: `<@${executorId}> (${executorId})` },
            { name: "Reason", value: reason },
        )
        .setTimestamp();
}

export function memberBanEmbed(ban: GuildBan, executorId: string | undefined, reason: string) {
    return new EmbedBuilder()
        .setTitle("📘 Audit: Member Banned")
        .setColor(Colors.error)
        .addFields(
            { name: "Target", value: `<@${ban.user.id}> (${ban.user.id})` },
            { name: "Executor", value: executorId ? `<@${executorId}> (${executorId})` : "Unknown" },
            { name: "Reason", value: reason },
        )
        .setTimestamp();
}

export function messageDeleteEmbed(message: Message) {
    function contentPreview(text: string) {
        if (!text || text.trim().length === 0) return "(empty or uncached)";
        if (text.length <= 400) return text;
        return `${text.slice(0, 400)}...`;
    }
    return new EmbedBuilder()
        .setTitle("📘 Audit: Message Deleted")
        .setColor(Colors.warning)
        .addFields(
            { name: "Author", value: message.author ? `<@${message.author.id}> (${message.author.id})` : "Unknown" },
            { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
            { name: "Message ID", value: message.id, inline: true },
            { name: "Content", value: contentPreview(message.content) },
        )
        .setTimestamp();
}

export function channelCreateEmbed(channel: GuildChannel, executorId: string | null) {
    function getChannelType(type: number) {
        switch (type) {
            case 0: return "Text Channel";
            case 2: return "Voice Channel";
            case 4: return "Category";
            case 5: return "Announcement Channel";
            case 13: return "Stage Channel";
            case 15: return "Directory Channel";
            default: return "Unknown";
        }
    }
    return new EmbedBuilder()
        .setTitle("📘 Audit: Channel Created")
        .setColor(Colors.success)
        .addFields(
            { name: "Channel", value: `${channel.toString()}` },
            { name: "Type", value: getChannelType(channel.type), inline: true },
            { name: "Executor", value: executorId ? `<@${executorId}>` : "Unknown", inline: true },
        )
        .setTimestamp();
}

export function channelDeleteEmbed(channel: GuildChannel, executorId: string | null) {
    return new EmbedBuilder()
        .setTitle("📘 Audit: Channel Deleted")
        .setColor(Colors.error)
        .addFields(
            { name: "Channel", value: `${channel.name} (${channel.id})` },
            { name: "Type", value: channel.type.toString(), inline: true },
            { name: "Executor", value: executorId ? `<@${executorId}> (${executorId})` : "Unknown", inline: true },
        )
        .setTimestamp();
}

export function roleUpdateEmbed(newMember: GuildMember, added: Map<string, Role>, removed: Map<string, Role>, executorId: string | undefined, reason: string | undefined) {
    return new EmbedBuilder()
        .setTitle("📘 Audit: Member Role Update")
        .setColor(Colors.warning)
        .addFields(
            { name: "Target", value: `<@${newMember.id}> (${newMember.id})` },
            {
                name: "Added Roles",
                value: added.size > 0 ? Array.from(added.values()).map((role) => `<@&${role.id}>`).join(", ") : "none",
            },
            {
                name: "Removed Roles",
                value: removed.size > 0 ? Array.from(removed.values()).map((role) => `<@&${role.id}>`).join(", ") : "none",
            },
            { name: "Executor", value: executorId ? `<@${executorId}> (${executorId})` : "Unknown" },
            { name: "Reason", value: reason ?? "No reason provided" },
        )
        .setTimestamp();
}
