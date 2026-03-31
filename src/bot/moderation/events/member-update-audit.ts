import { EmbedBuilder, Events, type GuildMember } from "discord.js";
import { Colors } from "@core/config";
import { detectRoleAuditEntry, recordSecurityEvent, sendAuditLog } from "../utils/security";
import type { BotClient } from "@core/BotClient";

export default {
    name: Events.GuildMemberUpdate,
    async execute(oldMember: GuildMember, newMember: GuildMember, client: BotClient) {
        const added = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
        const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

        if (added.size === 0 && removed.size === 0) return;

        const audit = await detectRoleAuditEntry(newMember.guild, newMember.id);

        const embed = new EmbedBuilder()
            .setTitle("📘 Audit: Member Role Update")
            .setColor(Colors.warning)
            .addFields(
                { name: "Target", value: `<@${newMember.id}> (${newMember.id})` },
                {
                    name: "Added Roles",
                    value: added.size > 0 ? added.map((role) => `<@&${role.id}>`).join(", ") : "none",
                },
                {
                    name: "Removed Roles",
                    value: removed.size > 0 ? removed.map((role) => `<@&${role.id}>`).join(", ") : "none",
                },
                { name: "Executor", value: audit?.executorId ? `<@${audit.executorId}> (${audit.executorId})` : "Unknown" },
                { name: "Reason", value: audit?.reason ?? "No reason provided" },
            )
            .setTimestamp();

        await sendAuditLog(newMember.guild, "role_update", embed);

        if (!audit?.executorId) return;

        if (added.size > 0) {
            await recordSecurityEvent({
                client,
                guild: newMember.guild,
                event: "role_grant",
                executorId: audit.executorId,
                targetId: newMember.id,
                source: "event:guildMemberUpdate",
                details: `added=${added.map((role) => role.id).join(",")}`,
            });
        }

        if (removed.size > 0) {
            await recordSecurityEvent({
                client,
                guild: newMember.guild,
                event: "role_remove",
                executorId: audit.executorId,
                targetId: newMember.id,
                source: "event:guildMemberUpdate",
                details: `removed=${removed.map((role) => role.id).join(",")}`,
            });
        }
    },
};
