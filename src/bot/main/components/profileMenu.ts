import {
    StringSelectMenuInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { Colors } from "@core/config";
import { PunishmentRepository, NoteRepository } from "@database/repositories";
import type { ComponentHandler } from "@core/config";

export const profileMenuHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^profile_menu_\d+$/,

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        const targetId = interaction.customId.split("_")[2];
        const selected = interaction.values[0];
        const guildId = interaction.guildId!;

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
                .setTitle(`📝 Notes for <@${targetId}>`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.info)
                .setFooter({ text: `Total: ${notes.length} note(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
                .setTitle(`📋 Punishment History`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.moderation)
                .setFooter({ text: `Punishment Level: ${level}/100 | Total: ${all.length} record(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (selected === "warnings") {
            const warns = await PunishmentRepository.findAllByUserAndType(targetId, guildId, "warn");
            const active = warns.filter(w => w.active && !w.appealed);

            if (!active.length) {
                await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`No active warnings for <@${targetId}>.`).setColor(Colors.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = active.slice(0, 15).map((w, i) =>
                `**${i + 1}.** \`${w.caseId}\` — ${w.reason}\n> By <@${w.moderatorId}> — <t:${Math.floor(w.createdAt.getTime() / 1000)}:R>`
            );

            const embed = new EmbedBuilder()
                .setTitle(`⚠️ Active Warnings`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.warning)
                .setFooter({ text: `${active.length} active warning(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (selected === "mutes") {
            const mutes = await PunishmentRepository.findAllByUserAndType(targetId, guildId, "mute");
            const active = mutes.filter(m => m.active && !m.appealed);

            if (!active.length) {
                await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`No active mutes for <@${targetId}>.`).setColor(Colors.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = active.slice(0, 15).map((m, i) =>
                `**${i + 1}.** \`${m.caseId}\` — ${m.reason}\n> By <@${m.moderatorId}> — <t:${Math.floor(m.createdAt.getTime() / 1000)}:R>`
            );

            const embed = new EmbedBuilder()
                .setTitle(`🔇 Active Mutes`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.moderation)
                .setFooter({ text: `${active.length} active mute(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (selected === "bans") {
            const all = await PunishmentRepository.findByUser(targetId, guildId);
            const bans = all.filter(p => (p.type === "ban" || p.type === "tempban") && p.active && !p.appealed);

            if (!bans.length) {
                await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`No active bans for <@${targetId}>.`).setColor(Colors.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = bans.slice(0, 15).map((b, i) => {
                const banType = b.type === "ban" ? "Permanent" : "Temporary";
                return `**${i + 1}.** \`${b.caseId}\` [${banType}] — ${b.reason}\n> By <@${b.moderatorId}> — <t:${Math.floor(b.createdAt.getTime() / 1000)}:R>`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`🔨 Active Bans`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.moderation)
                .setFooter({ text: `${bans.length} active ban(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
};
