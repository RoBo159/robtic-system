import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { Colors, FULL_POWER_ROLE_ID, MembersPunishments, PunishmentsSystem } from "@core/config";
import { ModMailRepository, PunishmentRepository } from "@database/repositories";
import { NoteRepository } from "@database/repositories/NoteRepository";
import { getMemberLevel } from "@shared/utils/access";
import { t, type Lang } from "@shared/utils/lang";
import data from "@shared/data.json";
import type { TextChannel } from "discord.js";

export const appealDecision: ComponentHandler<ButtonInteraction> = {
    customId: /^appeal_(approve|approvepoints|approvenopoints|deny|openchat)_[A-Za-z0-9-]+_\d+_(en|ar)$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const customCaseId = parts[2];
        const userId = parts[3];
        const lang = (parts[4] === "ar" ? "ar" : "en") as Lang;
        const embedCaseId = interaction.message.embeds[0]?.fields.find(f => f.name === "Case ID")?.value;
        const caseId = (embedCaseId && embedCaseId !== "N/A") ? embedCaseId : customCaseId;

        const modMember = interaction.member as GuildMember;

        const hasFullPower = modMember.roles.cache.has(FULL_POWER_ROLE_ID);
        const modLevel = getMemberLevel(modMember);

        if (!hasFullPower && modLevel.score < 80) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setDescription("❌ Only Manager+ can handle appeals.").setColor(Colors.error)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (action === "openchat") {
            const existing = await ModMailRepository.findOpenByUser(userId);
            if (existing) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription(`⚠️ User already has an open chat: <#${existing.threadId}>`).setColor(Colors.warning)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
            const staffChannel = staffGuild?.channels.cache.get(data.modmail_channel_id) as TextChannel | undefined;

            if (!staffGuild || !staffChannel) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription("❌ Modmail channel was not found.").setColor(Colors.error)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const targetUser = await client.users.fetch(userId).catch(() => null);
            const thread = await staffChannel.threads.create({
                name: `appeal-${targetUser?.username ?? userId}`,
                autoArchiveDuration: 1440,
                reason: `Appeal chat opened by ${interaction.user.tag} for case ${caseId}`,
            });

            await ModMailRepository.create({
                userId,
                threadId: thread.id,
                guildId: staffGuild.id,
                staffChannelId: staffChannel.id,
                language: lang,
                requestType: "appeal",
            });
            await ModMailRepository.claim(thread.id, interaction.user.id);

            const infoEmbed = new EmbedBuilder()
                .setTitle("📝 Appeal Chat Opened")
                .setColor(Colors.info)
                .addFields(
                    { name: "User", value: `<@${userId}>`, inline: true },
                    { name: "Case ID", value: caseId, inline: true },
                    { name: "Opened By", value: `<@${interaction.user.id}>`, inline: true },
                )
                .setTimestamp();

            await thread.send({ embeds: [infoEmbed] });

            if (targetUser) {
                const openMsg = lang === "ar"
                    ? "💬 تم فتح محادثة استئناف مع فريق الإدارة. يمكنك الرد هنا مباشرة."
                    : "💬 An appeal chat has been opened with the moderation team. You can reply here directly.";
                await targetUser.send({ content: openMsg }).catch(() => null);
            }

            await interaction.reply({
                embeds: [new EmbedBuilder().setDescription(`✅ Opened appeal chat: <#${thread.id}>`).setColor(Colors.success)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (action === "deny") {
            const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(Colors.error)
                .setFooter({ text: `❌ Denied by ${interaction.user.username}` });

            await interaction.update({ embeds: [deniedEmbed], components: [] });

            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const msg = lang === "ar"
                    ? "❌ تم رفض طلب الاستئناف الخاص بك بعد المراجعة."
                    : "❌ Your appeal has been denied after review.";
                await user.send({ content: msg }).catch(() => null);
            }
            return;
        }

        const punishment = await PunishmentRepository.findByCaseId(caseId);
        if (!punishment || punishment.userId !== userId) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setDescription("❌ The selected punishment case was not found.").setColor(Colors.error)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (punishment.appealed) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setDescription("⚠️ This appeal has already been processed.").setColor(Colors.warning)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await PunishmentRepository.appeal(caseId, `Approved by ${interaction.user.username}`);

        const normalizedAction = action === "approve" ? "approvepoints" : action;

        if (normalizedAction === "approvepoints") {
            const typePointsMap: Record<string, number> = {
                warn: PunishmentsSystem.warn,
                mute: PunishmentsSystem.mute,
                ban: PunishmentsSystem.ban,
                tempban: PunishmentsSystem.ban,
            };
            const points = typePointsMap[punishment.type] ?? 0;

            if (points > 0) {
                const guild = client.guilds.cache.get(process.env.MainGuild!);
                const targetUser = await client.users.fetch(userId).catch(() => null);
                const newLevel = await PunishmentRepository.removePunishmentLevel(
                    userId,
                    targetUser?.username ?? "Unknown",
                    points,
                );
                const levelInfo = PunishmentRepository.getLevelInfo(newLevel);

                const member = guild?.members.cache.get(userId)
                    ?? await guild?.members.fetch(userId).catch(() => null);

                if (member) {
                    const allRoleIds = Object.values(MembersPunishments).map(p => p.id);
                    const rolesToRemove = member.roles.cache.filter(r => allRoleIds.includes(r.id));
                    for (const [, role] of rolesToRemove) {
                        await member.roles.remove(role).catch(() => null);
                    }
                    if (levelInfo.roleId) {
                        await member.roles.add(levelInfo.roleId).catch(() => null);
                    }
                }
            }
        }

        const guild = client.guilds.cache.get(process.env.MainGuild!);
        const member = guild?.members.cache.get(userId)
            ?? await guild?.members.fetch(userId).catch(() => null);

        if (member && punishment.type === "mute") {
            await member.timeout(null, "Appeal approved").catch(() => null);
        }

        if (punishment.type === "ban" || punishment.type === "tempban") {
            await guild?.bans.remove(userId, "Appeal approved").catch(() => null);
        }

        const footerText = normalizedAction === "approvenopoints"
            ? `✅ Approved (kept points) by ${interaction.user.username}`
            : `✅ Approved (removed points) by ${interaction.user.username}`;

        const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(Colors.success)
            .setFooter({ text: footerText });

        await interaction.update({ embeds: [approvedEmbed], components: [] });

        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
            const msg = lang === "ar"
                ? "✅ تمت الموافقة على طلب الاستئناف الخاص بك."
                : "✅ Your appeal has been approved.";
            await user.send({ content: msg }).catch(() => null);
        }
        return;
    },
};

export const appealNote: ComponentHandler<ButtonInteraction> = {
    customId: /^appeal_note_[A-Za-z0-9-]+_\d+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const caseId = parts[2];
        const userId = parts[3];

        const modal = new ModalBuilder()
            .setCustomId(`appeal_note_submit_${caseId}_${userId}`)
            .setTitle("Add Note");

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("note_content")
                    .setLabel("Note")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000)
            ),
        );

        await interaction.showModal(modal);
    },
};

export const appealNoteSubmit: ComponentHandler<import("discord.js").ModalSubmitInteraction> = {
    customId: /^appeal_note_submit_[A-Za-z0-9-]+_\d+$/,

    async run(interaction: import("discord.js").ModalSubmitInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const caseId = parts[3];
        const userId = parts[4];
        const content = interaction.fields.getTextInputValue("note_content").trim();

        await NoteRepository.create(userId, `[Appeal ${caseId}] ${content}`, interaction.user.id);

        await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`📝 Note added for <@${userId}>.`).setColor(Colors.success)],
            flags: MessageFlags.Ephemeral,
        });
    },
};
