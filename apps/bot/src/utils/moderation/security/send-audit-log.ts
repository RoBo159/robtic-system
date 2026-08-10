import type { EmbedBuilder, Guild } from "discord.js";
import { AuditLogRepository } from "@database/repositories";
import { AUDIT_ACTOR_FIELD_REGEX, AUDIT_TARGET_FIELD_REGEX } from "@constants";
import type { AuditChannelKey } from "../config";
import { getModerationSecurityConfig } from "./get-moderation-security-config";
import { resolveLogChannel } from "./resolve-log-channel";
import { extractSnowflake } from "./extract-snowflake";

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
    const actorField = fields.find((field) => AUDIT_ACTOR_FIELD_REGEX.test(field.name));
    const targetField = fields.find((field) => AUDIT_TARGET_FIELD_REGEX.test(field.name));

    await AuditLogRepository.log({
        guildId: guild.id,
        eventName: `moderation:${key}`,
        source: "moderation-system",
        actorId: actorField ? extractSnowflake(String(actorField.value)) : undefined,
        targetId: targetField ? extractSnowflake(String(targetField.value)) : undefined,
        channelId: channel.id,
        botName: "main",
        metadata: {
            title: data.title,
            description: data.description,
            fields: fields.map((field) => ({ name: field.name, value: String(field.value) })),
        },
    }).catch(() => null);
}
