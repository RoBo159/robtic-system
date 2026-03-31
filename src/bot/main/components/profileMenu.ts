import {
    StringSelectMenuInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { Colors } from "@core/config";
import { PunishmentRepository, NoteRepository, ActivityRepository, ProjectsRepository } from "@database/repositories";
import type { ComponentHandler } from "@core/config";
import { calculateLevel, xpForLevel } from "../../community/services/xp-service";
import { getStaffActivity, getSupportStats, getActivityLogs } from "@shared/utils/staff-activity";
import { isStaff } from "@shared/utils/access";
import type { GuildMember } from "discord.js";
import emoji from "@shared/emojis.json";

export const profileMenuHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^profile_menu_\d+$/,

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        const targetId = interaction.customId.split("_")[2];
        const selected = interaction.values[0];
        const guildId = interaction.guildId!;

        const user = await client.users.fetch(targetId).catch(() => null);
        const putUser = interaction.user.id === targetId && "— " + user?.username || "";

        if (selected === "activity") {
            const record = await ActivityRepository.findOrCreate(targetId, guildId, "unknown");
            const level = calculateLevel(record.totalXP);
            const rank = await ActivityRepository.getRank(targetId, guildId);
            const progress = record.totalXP - xpForLevel(level);
            const needed = xpForLevel(level + 1) - xpForLevel(level);
            const logs = await getActivityLogs(targetId, guildId, 10);

            const recentLines = logs.length > 0
                ? logs.map(l => `\`${l.type}\` **${l.amount >= 0 ? "+" : ""}${l.amount}** ${l.details ? `— ${l.details}` : ""} <t:${Math.floor(l.createdAt.getTime() / 1000)}:R>`).join("\n")
                : "No recent activity.";

            const decayStatus = record.decay.enabled
                ? `Active — Last active <t:${Math.floor(record.decay.lastActiveAt.getTime() / 1000)}:R>${record.decay.inactiveDays > 0 ? ` (${record.decay.inactiveDays}d inactive)` : ""}`
                : "Disabled";

            const embed = new EmbedBuilder()
                .setTitle(`${emoji.status} Activity ${putUser}`)
                .addFields(
                    { name: "Level", value: `${level}`, inline: true },
                    { name: "Total XP", value: `${record.totalXP}`, inline: true },
                    { name: "Rank", value: `#${rank}`, inline: true },
                    { name: "Messages", value: `${record.messageCount}`, inline: true },
                    { name: "Progress", value: `${"█".repeat(Math.round((progress / needed) * 10))}${"░".repeat(10 - Math.round((progress / needed) * 10))} \`${progress}/${needed}\``, inline: false },
                    { name: "Decay", value: decayStatus, inline: false },
                    { name: "Recent Activity", value: recentLines.slice(0, 1024) },
                )
                .setColor(Colors.default)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (selected === "staff_activity") {
            const member = interaction.guild?.members.cache.get(targetId) ?? await interaction.guild?.members.fetch(targetId).catch(() => null);
            if (!member || !isStaff(member as GuildMember)) {
                await interaction.reply({ content: "This user is not a staff member.", flags: MessageFlags.Ephemeral });
                return;
            }

            const staffData = await getStaffActivity(targetId, guildId);
            const supportStats = await getSupportStats(targetId);
            const avgResponse = supportStats.avgResponseMs > 0 ? `${Math.round(supportStats.avgResponseMs / 1000)}s` : "N/A";

            const embed = new EmbedBuilder()
                .setTitle(`${emoji.trophy} Staff Activity ${putUser}`)
                .addFields(
                    { name: "Support Points", value: `${staffData.supportPoints}`, inline: true },
                    { name: "Public Chat Points", value: `${staffData.publicChatPoints}`, inline: true },
                    { name: "Staff Chat Points", value: `${staffData.staffChatPoints}`, inline: true },
                    { name: "Penalties", value: `${staffData.penalties}`, inline: true },
                    { name: "Total Staff Points", value: `**${staffData.totalStaffPoints}**`, inline: true },
                    { name: "\u200b", value: "\u200b", inline: true },
                    { name: "\u200b", value: "**── Support Performance ──**" },
                    { name: "Sessions Claimed", value: `${supportStats.totalClaimed}`, inline: true },
                    { name: "Sessions Resolved", value: `${supportStats.totalResolved}`, inline: true },
                    { name: "Avg Response Time", value: avgResponse, inline: true },
                    { name: "Support Points Earned", value: `${supportStats.totalPoints}`, inline: true },
                )
                .setColor(Colors.default)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (selected === "notes") {
            const notes = await NoteRepository.findByUser(targetId);

            if (!notes.length) {
                await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`No notes found for <@${targetId}>.`).setColor(Colors.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = notes.slice(0, 15).map((n, i) =>
                `**${i + 1}.** ${n.content}\n> By <@${n.createdBy}> — <t:${Math.floor(n.createdAt.getTime() / 1000)}:R>`
            );

            const embed = new EmbedBuilder()
                .setTitle(`${emoji.info} Notes for ${putUser}`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.info)
                .setFooter({ text: `Total: ${notes.length} note(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (selected === "projects") {
            const projects = await ProjectsRepository.findByUserId(targetId);

            if (!projects.length) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription(`No projects found for <@${targetId}>.`).setColor(Colors.info)],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = projects.slice(0, 10).map((project, index) => {
                const createdAt = Math.floor(project.createdAt.getTime() / 1000);
                return `**${index + 1}.** ${project.projectTitle} (\`${project.projectId}\`)\n> Type: ${project.projectType} | 👍 ${project.likes.length} | 👎 ${project.dislikes.length} | ${emoji.eyes} ${project.views} | <t:${createdAt}:R>`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`${emoji.gear} Projects ${putUser}`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.info)
                .setFooter({ text: `Showing ${Math.min(projects.length, 10)} of ${projects.length} project(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (selected === "history") {
            const all = await PunishmentRepository.findByUser(targetId, guildId);
            const level = await PunishmentRepository.getPunishmentLevel(targetId);

            if (!all.length) {
                await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`No punishment history for <@${targetId}>.`).setColor(Colors.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = all.slice(0, 20).map((p, i) => {
                const status = p.appealed ? "~~Appealed~~" : p.active ? "🔴 Active" : "⚪ Inactive";
                const typeIcon = p.type === "warn" ? "⚠️" : p.type === "mute" ? "🔇" : "🔨";
                return `**${i + 1}.** ${typeIcon} \`${p.caseId}\` [${p.type.toUpperCase()}] — ${status}\n> ${p.reason} — <t:${Math.floor(p.createdAt.getTime() / 1000)}:R>`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`${emoji.note} Punishment History ${putUser}`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.moderation)
                .setFooter({ text: `Punishment Level: ${level}/100 | Total: ${all.length} record(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
};
