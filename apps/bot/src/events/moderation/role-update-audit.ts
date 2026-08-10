import { AuditLogEvent, EmbedBuilder, Events, type Role } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { sendToServerLog } from "@bot/utils/server-log";

export default {
    name: Events.GuildRoleUpdate,
    async execute(oldRole: Role, newRole: Role, client: BotClient) {
        const changes: string[] = [];
        if (oldRole.name !== newRole.name) changes.push(`Name: \`${oldRole.name}\` → \`${newRole.name}\``);
        if (oldRole.color !== newRole.color) changes.push(`Color: \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push("Permissions changed");
        if (oldRole.mentionable !== newRole.mentionable) changes.push(`Mentionable: ${oldRole.mentionable} → ${newRole.mentionable}`);
        if (oldRole.hoist !== newRole.hoist) changes.push(`Hoisted: ${oldRole.hoist} → ${newRole.hoist}`);

        if (changes.length === 0) return;

        const logs = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 6 }).catch(() => null);
        const entry = logs?.entries.find(e => Date.now() - e.createdTimestamp < 15_000);
        const executorId = entry?.executor?.id;

        const embed = new EmbedBuilder()
            .setTitle("📘 Audit: Role Updated")
            .setColor(COLORS.warning)
            .addFields(
                { name: "Role", value: `<@&${newRole.id}> (\`${newRole.id}\`)` },
                { name: "Changes", value: changes.join("\n") },
                { name: "Executor", value: executorId ? `<@${executorId}> (${executorId})` : "Unknown", inline: true },
            )
            .setTimestamp();

        await sendToServerLog(client, newRole.guild.id, "role-update", embed);
    },
};
