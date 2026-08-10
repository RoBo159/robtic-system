import { AuditLogEvent, EmbedBuilder, Events, type Role } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { sendToServerLog } from "@bot/utils/server-log";

export default {
    name: Events.GuildRoleCreate,
    async execute(role: Role, client: BotClient) {
        const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 6 }).catch(() => null);
        const entry = logs?.entries.find(e => Date.now() - e.createdTimestamp < 15_000);
        const executorId = entry?.executor?.id;

        const embed = new EmbedBuilder()
            .setTitle("📘 Audit: Role Created")
            .setColor(COLORS.success)
            .addFields(
                { name: "Role", value: `<@&${role.id}> — ${role.name} (\`${role.id}\`)` },
                { name: "Color", value: role.hexColor, inline: true },
                { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
                { name: "Executor", value: executorId ? `<@${executorId}> (${executorId})` : "Unknown", inline: true },
            )
            .setTimestamp();

        await sendToServerLog(client, role.guild.id, "role-create", embed);
    },
};
