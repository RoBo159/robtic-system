import { AuditLogEvent, EmbedBuilder, type Guild, type GuildMember, type GuildTextBasedChannel } from "discord.js";
import type { BotClient } from "@core/BotClient";
import { Colors } from "@core/config";
import { ConfigRepository } from "@database/repositories";
import { AuditLogRepository } from "@database/repositories";
import {
    buildSecurityConfigKey,
    formatWindow,
    normalizeSecurityConfig,
    DEFAULT_MODERATION_SECURITY_CONFIG,
    type AuditChannelKey,
    type ModerationSecurityConfig,
    type SecurityActionType,
    type SecurityEventType,
    type SecurityRule,
} from "./config";

const actionHistory = new Map<string, number[]>();
const lastViolationTrigger = new Map<string, number>();

function historyKey(guildId: string, moderatorId: string, event: SecurityEventType): string {
    return `${guildId}:${moderatorId}:${event}`;
}

function triggerKey(guildId: string, moderatorId: string, rule: SecurityRule): string {
    return `${guildId}:${moderatorId}:${rule.event}:${rule.limit}:${rule.windowMs}:${rule.actions.join(",")}`;
}

function cleanHistory(items: number[], now: number, windowMs: number): number[] {
    return items.filter((timestamp) => now - timestamp <= windowMs);
}

function truncateContent(content: string, size = 900): string {
    if (!content) return "(empty)";
    if (content.length <= size) return content;
    return `${content.slice(0, size)}...`;
}

function extractSnowflake(text: string): string | undefined {
    const match = text.match(/\d{16,20}/);
    return match?.[0];
}

export async function getModerationSecurityConfig(guildId: string): Promise<ModerationSecurityConfig> {
    const key = buildSecurityConfigKey(guildId);
    const doc = await ConfigRepository.get(key, "moderation");

    let normalized = doc ? normalizeSecurityConfig(doc.value) : undefined;
    if (!normalized) {
        normalized = DEFAULT_MODERATION_SECURITY_CONFIG;
        await ConfigRepository.set(key, "moderation", normalized, "system");
        return normalized;
    }

    if (doc && JSON.stringify(normalized) !== JSON.stringify(doc.value)) {
        await ConfigRepository.set(key, "moderation", normalized, String((doc && doc.updatedBy) || "system"));
    }

    return normalized;
}

export async function saveModerationSecurityConfig(guildId: string, config: ModerationSecurityConfig, updatedBy: string): Promise<ModerationSecurityConfig> {
    const key = buildSecurityConfigKey(guildId);
    let normalized = normalizeSecurityConfig(config);
    if (!normalized) normalized = DEFAULT_MODERATION_SECURITY_CONFIG;
    await ConfigRepository.set(key, "moderation", normalized, updatedBy);
    return normalized;
}

export async function resolveLogChannel(guild: Guild, channelId: string): Promise<GuildTextBasedChannel | null> {
    if (!channelId) return null;
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;
    return channel as GuildTextBasedChannel;
}

export async function sendAuditLog(
    guild: Guild,
    key: AuditChannelKey,
    embed: EmbedBuilder,
): Promise<void> {
    const config = await getModerationSecurityConfig(guild.id);
    const channelId = config.settings.auditChannels[key];
    const channel = await resolveLogChannel(guild, channelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] }).catch(() => null);

    const data = embed.data;
    const fields = data.fields ?? [];
    const actorField = fields.find((field) => /executor|moderator|author|by/i.test(field.name));
    const targetField = fields.find((field) => /target|user|member/i.test(field.name));

    await AuditLogRepository.log({
        guildId: guild.id,
        eventName: `moderation:${key}`,
        source: "moderation-system",
        actorId: actorField ? extractSnowflake(String(actorField.value)) : undefined,
        targetId: targetField ? extractSnowflake(String(targetField.value)) : undefined,
        channelId: channel.id,
        botName: "moderation",
        metadata: {
            title: data.title,
            description: data.description,
            fields: fields.map((field) => ({ name: field.name, value: String(field.value) })),
        },
    }).catch(() => null);
}

export async function sendSecurityAlert(
    guild: Guild,
    embed: EmbedBuilder,
): Promise<void> {
    const config = await getModerationSecurityConfig(guild.id);
    const channel = await resolveLogChannel(guild, config.settings.securityLogChannelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] }).catch(() => null);
}

export async function isWhitelisted(guild: Guild, userId: string): Promise<boolean> {
    const config = await getModerationSecurityConfig(guild.id);
    if (config.whitelistUserIds.includes(userId)) return true;

    const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    return member.roles.cache.some((role) => config.whitelistRoleIds.includes(role.id));
}

async function applyAction(
    action: SecurityActionType,
    guild: Guild,
    executorId: string,
): Promise<string> {
    const member = guild.members.cache.get(executorId) ?? await guild.members.fetch(executorId).catch(() => null);
    if (!member) return `failed:${action}:member_not_found`;

    if (action === "send_alert") return "ok:send_alert";

    if (action === "remove_role") {
        const config = await getModerationSecurityConfig(guild.id);
        const configuredRoles = config.settings.rolesToStrip;

        let targetRoles = member.roles.cache.filter((role) => !role.managed && role.id !== guild.id);
        if (configuredRoles.length > 0) {
            targetRoles = targetRoles.filter((role) => configuredRoles.includes(role.id));
        }

        if (targetRoles.size === 0) return "skip:remove_role:none";

        await member.roles.remove(targetRoles).catch(() => null);
        return `ok:remove_role:${targetRoles.size}`;
    }

    if (action === "kick") {
        if (!member.kickable) return "failed:kick:not_kickable";
        await member.kick("Security threshold exceeded").catch(() => null);
        return "ok:kick";
    }

    if (!guild.members.me?.permissions.has("BanMembers")) {
        return "failed:ban:no_permission";
    }

    await guild.members.ban(executorId, { reason: "Security threshold exceeded" }).catch(() => null);
    return "ok:ban";
}

export async function recordSecurityEvent(params: {
    client: BotClient;
    guild: Guild;
    event: SecurityEventType;
    executorId: string;
    targetId?: string;
    details?: string;
    source?: string;
}): Promise<void> {
    const { guild, event, executorId, targetId, details, source } = params;
    const now = Date.now();

    const config = await getModerationSecurityConfig(guild.id);
    if (!config.enabled) return;

    if (config.whitelistUserIds.includes(executorId)) return;

    const member = guild.members.cache.get(executorId) ?? await guild.members.fetch(executorId).catch(() => null);
    if (member && member.roles.cache.some((role) => config.whitelistRoleIds.includes(role.id))) return;

    const rules = config.rules.filter((rule) => rule.event === event);
    if (!rules.length) return;

    for (const rule of rules) {
        const key = historyKey(guild.id, executorId, event);
        const history = actionHistory.get(key) ?? [];
        const freshHistory = cleanHistory(history, now, rule.windowMs);
        freshHistory.push(now);
        actionHistory.set(key, freshHistory);

        if (freshHistory.length < rule.limit) continue;

        const cooldownKey = triggerKey(guild.id, executorId, rule);
        const lastTriggered = lastViolationTrigger.get(cooldownKey) ?? 0;
        if (now - lastTriggered < rule.windowMs) continue;
        lastViolationTrigger.set(cooldownKey, now);

        const outcomes: string[] = [];
        for (const action of rule.actions) {
            outcomes.push(await applyAction(action, guild, executorId));
        }

        const alertEmbed = new EmbedBuilder()
            .setTitle("🚨 Security Threshold Triggered")
            .setColor(Colors.error)
            .addFields(
                { name: "Executor", value: `<@${executorId}> (${executorId})` },
                { name: "Event", value: event, inline: true },
                { name: "Count", value: `${freshHistory.length}/${rule.limit}`, inline: true },
                { name: "Window", value: formatWindow(rule.windowMs), inline: true },
                { name: "Actions", value: rule.actions.join(", "), inline: true },
                { name: "Action Results", value: outcomes.join("\n") || "none" },
                ...(targetId ? [{ name: "Last Target", value: `<@${targetId}> (${targetId})` }] : []),
                ...(source ? [{ name: "Source", value: source, inline: true }] : []),
                ...(details ? [{ name: "Details", value: truncateContent(details, 1024) }] : []),
            )
            .setTimestamp();

        await sendSecurityAlert(guild, alertEmbed);

        const auditEmbed = new EmbedBuilder()
            .setTitle("🛡️ Security Alert (Audit)")
            .setColor(Colors.warning)
            .setDescription(
                `User <@${executorId}> triggered a security rule for **${event}** (${freshHistory.length}/${rule.limit} in ${formatWindow(rule.windowMs)}).`
            )
            .addFields(
                { name: "Actions", value: rule.actions.join(", "), inline: true },
                { name: "Results", value: outcomes.join("\n") || "none" },
            )
            .setTimestamp();

        await sendAuditLog(guild, "role_update", auditEmbed);
    }
}

export async function detectKickAuditEntry(guild: Guild, targetId: string): Promise<{ executorId: string; reason: string } | null> {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 6 }).catch(() => null);
    const entry = logs?.entries.find((item) => {
        if (!item.target || item.target.id !== targetId) return false;
        return Date.now() - item.createdTimestamp < 15_000;
    });

    if (!entry?.executor?.id) return null;

    return {
        executorId: entry.executor.id,
        reason: entry.reason ?? "No reason provided",
    };
}

export async function detectBanAuditEntry(guild: Guild, targetId: string): Promise<{ executorId: string; reason: string } | null> {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 6 }).catch(() => null);
    const entry = logs?.entries.find((item) => {
        if (!item.target || item.target.id !== targetId) return false;
        return Date.now() - item.createdTimestamp < 15_000;
    });

    if (!entry?.executor?.id) return null;

    return {
        executorId: entry.executor.id,
        reason: entry.reason ?? "No reason provided",
    };
}

export async function detectRoleAuditEntry(guild: Guild, targetId: string): Promise<{ executorId: string; reason: string } | null> {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 6 }).catch(() => null);
    const entry = logs?.entries.find((item) => {
        if (!item.target || item.target.id !== targetId) return false;
        return Date.now() - item.createdTimestamp < 15_000;
    });

    if (!entry?.executor?.id) return null;

    return {
        executorId: entry.executor.id,
        reason: entry.reason ?? "No reason provided",
    };
}

export async function ensureManagerSecurityAccess(member: GuildMember): Promise<boolean> {
    return member.permissions.has("ManageGuild") || member.permissions.has("Administrator");
}
