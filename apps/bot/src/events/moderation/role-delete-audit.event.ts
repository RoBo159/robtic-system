import { AuditLogEvent, EmbedBuilder, Events, type Role } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { sendToServerLog } from "@bot/utils/server-log";

export default {
    name: Events.GuildRoleDelete,
    async execute(role: Role, client: BotClient) {
        const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 6 }).catch(() => null);
        const entry = logs?.entries.find(e => Date.now() - e.createdTimestamp < 15_000);
        const executorId = entry?.executor?.id;

        const embed = new EmbedBuilder()
            .setTitle("📘 Audit: Role Deleted")
            .setColor(COLORS.error)
            .addFields(
                { name: "Role", value: `${role.name} (\`${role.id}\`)` },
                { name: "Executor", value: executorId ? `<@${executorId}> (${executorId})` : "Unknown", inline: true },
            )
            .setTimestamp();

        await sendToServerLog(client, role.guild.id, "role-delete", embed);
    },
};
