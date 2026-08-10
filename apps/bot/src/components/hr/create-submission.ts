import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalSubmitInteraction,
    MessageFlags,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { StaffRepository, SubmitConfigRepository, SubmissionTypeRepository } from "@database/repositories";

export default {
    customId: /^staff-submit_/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const key = interaction.customId.slice("staff-submit_".length);
        const guildId = interaction.guildId!;
        const type = await SubmissionTypeRepository.get(guildId, key);

        if (!type || !type.questions.length) {
            await interaction.editReply({
                content: "❌ No questions configured for this submission type.",
            });
            return;
        }

        const config = await SubmitConfigRepository.get(guildId);
        if (!config?.reviewChannelId) {
            await interaction.editReply({
                content: "❌ The submission system is not configured. Please contact an administrator.",
            });
            return;
        }

        const reviewChannel = interaction.guild?.channels.cache.get(config.reviewChannelId) as TextChannel | undefined;
        if (!reviewChannel) {
            await interaction.editReply({
                content: "❌ Review channel not found. Please contact an administrator.",
            });
            return;
        }

        const answers = type.questions.map(q => ({
            id: q.id,
            question: q.question,
            answer: interaction.fields.getTextInputValue(q.id),
        }));

        const embed = new EmbedBuilder()
            .setTitle(`New ${type.name} Submission`)
            .setDescription(`From <@${interaction.user.id}>`)
            .addFields(answers.map(a => ({ name: a.question, value: a.answer })))
            .setColor(COLORS.hr)
            .setTimestamp();

        const interviewBtn = new ButtonBuilder()
            .setCustomId(`staff-interview_${type.key}_${interaction.user.id}`)
            .setLabel("Interview")
            .setStyle(ButtonStyle.Primary);

        const rejectBtn = new ButtonBuilder()
            .setCustomId(`staff-reject_${type.key}_${interaction.user.id}`)
            .setLabel("Reject")
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(interviewBtn, rejectBtn);

        const ping = type.managerRoleIds.map(id => `<@&${id}>`).join(" ");

        await reviewChannel.send({
            content: ping || undefined,
            embeds: [embed],
            components: [row],
        });

        await StaffRepository.createSubmission({
            userId: interaction.user.id,
            department: type.key,
            questions: answers,
        });

        await interaction.editReply({
            content: "✅ Your application has been submitted! You will be notified once it is reviewed.",
        });
    },
};
