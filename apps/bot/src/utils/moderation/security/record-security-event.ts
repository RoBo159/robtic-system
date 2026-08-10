import { EmbedBuilder, type Guild } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, SECURITY_MESSAGES, SECURITY_CONTENT_TRUNCATE } from "@constants";
import { formatWindow, type SecurityEventType } from "../config";
import { actionHistory, lastViolationTrigger, historyKey, triggerKey, cleanHistory } from "./history-store";
import { getModerationSecurityConfig } from "./get-moderation-security-config";
import { applyAction } from "./apply-action";
import { sendSecurityAlert } from "./send-security-alert";
import { sendAuditLog } from "./send-audit-log";
import { truncateContent } from "./truncate-content";

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
            .setTitle(SECURITY_MESSAGES.alertTitle)
            .setColor(COLORS.error)
            .addFields(
                { name: SECURITY_MESSAGES.executorFieldName, value: `<@${executorId}> (${executorId})` },
                { name: SECURITY_MESSAGES.eventFieldName, value: event, inline: true },
                { name: SECURITY_MESSAGES.countFieldName, value: `${freshHistory.length}/${rule.limit}`, inline: true },
                { name: SECURITY_MESSAGES.windowFieldName, value: formatWindow(rule.windowMs), inline: true },
                { name: SECURITY_MESSAGES.actionsFieldName, value: rule.actions.join(", "), inline: true },
                { name: SECURITY_MESSAGES.actionResultsFieldName, value: outcomes.join("\n") || SECURITY_MESSAGES.noneValue },
                ...(targetId ? [{ name: SECURITY_MESSAGES.lastTargetFieldName, value: `<@${targetId}> (${targetId})` }] : []),
                ...(source ? [{ name: SECURITY_MESSAGES.sourceFieldName, value: source, inline: true }] : []),
                ...(details ? [{ name: SECURITY_MESSAGES.detailsFieldName, value: truncateContent(details, SECURITY_CONTENT_TRUNCATE.embedField) }] : []),
            )
            .setTimestamp();

        await sendSecurityAlert(guild, alertEmbed);

        const auditEmbed = new EmbedBuilder()
            .setTitle(SECURITY_MESSAGES.auditTitle)
            .setColor(COLORS.warning)
            .setDescription(SECURITY_MESSAGES.auditDescription(
                executorId, event, freshHistory.length, rule.limit, formatWindow(rule.windowMs),
            ))
            .addFields(
                { name: SECURITY_MESSAGES.actionsFieldName, value: rule.actions.join(", "), inline: true },
                { name: SECURITY_MESSAGES.resultsFieldName, value: outcomes.join("\n") || SECURITY_MESSAGES.noneValue },
            )
            .setTimestamp();

        await sendAuditLog(guild, "role_update", auditEmbed);
    }
}
