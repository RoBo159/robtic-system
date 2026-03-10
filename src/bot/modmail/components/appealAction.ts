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
import { PunishmentRepository } from "@database/repositories";
import { NoteRepository } from "@database/repositories/NoteRepository";
import { getMemberLevel } from "@shared/utils/access";
import { t, type Lang } from "@shared/utils/lang";

export const appealDecision: ComponentHandler<ButtonInteraction> = {
    customId: /^appeal_(approve|deny)_\w+_\d+_(en|ar)$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const appealType = parts[2];
        const userId = parts[3];
        const lang = parts[4] as Lang;

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

        if (action === "approve") {
            const embed = interaction.message.embeds[0];
            const caseIdField = embed?.fields.find(f => f.name === "Case ID");
            const caseId = caseIdField?.value;

            if (caseId && caseId !== "N/A") {
                const punishment = await PunishmentRepository.findByCaseId(caseId);

                if (punishment && !punishment.appealed) {
                    await PunishmentRepository.appeal(caseId, `Approved by ${interaction.user.username}`);

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

                            if (punishment.type === "mute") {
                                await member.timeout(null, "Appeal approved").catch(() => null);
                            }
                        }

                        if (punishment.type === "ban" || punishment.type === "tempban") {
                            await guild?.bans.remove(userId, "Appeal approved").catch(() => null);
                        }
                    }
                }
            }

            const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(Colors.success)
                .setFooter({ text: `✅ Approved by ${interaction.user.username}` });

            await interaction.update({ embeds: [approvedEmbed], components: [] });

            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const msg = lang === "ar"
                    ? "✅ تمت الموافقة على طلب الاستئناف الخاص بك. سيتم اتخاذ الإجراء المناسب."
                    : "✅ Your appeal has been approved. Appropriate action will be taken.";
                await user.send({ content: msg }).catch(() => null);
            }
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
    },
};

export const appealNote: ComponentHandler<ButtonInteraction> = {
    customId: /^appeal_note_\d+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const userId = interaction.customId.replace("appeal_note_", "");

        const modal = new ModalBuilder()
            .setCustomId(`appeal_note_submit_${userId}`)
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
    customId: /^appeal_note_submit_\d+$/,

    async run(interaction: import("discord.js").ModalSubmitInteraction, client: BotClient) {
        const userId = interaction.customId.replace("appeal_note_submit_", "");
        const content = interaction.fields.getTextInputValue("note_content").trim();

        await NoteRepository.create(userId, content, interaction.user.id);

        await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`📝 Note added for <@${userId}>.`).setColor(Colors.success)],
            flags: MessageFlags.Ephemeral,
        });
    },
};
