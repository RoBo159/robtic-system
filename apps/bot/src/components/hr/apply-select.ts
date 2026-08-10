import {
    StringSelectMenuInteraction,
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { StaffRepository, SubmissionTypeRepository } from "@database/repositories";

export default {
    customId: "staff-apply-select",

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        const key = interaction.values[0];
        const [type, existing] = await Promise.all([
            SubmissionTypeRepository.get(interaction.guildId!, key),
            StaffRepository.getSubmission(interaction.user.id),
        ]);

        if (!type || !type.isOpen) {
            await interaction.reply({
                content: "❌ This submission type is no longer open.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (!type.questions.length) {
            await interaction.reply({
                content: "❌ No questions configured for this submission type yet.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (existing) {
            await interaction.reply({
                content: "❌ You already have an active submission. Please wait for it to be reviewed.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`staff-submit_${type.key}`)
            .setTitle(`${type.name} Application`.slice(0, 45))
            .addComponents(
                type.questions.map(q =>
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId(q.id)
                            .setLabel(q.question.slice(0, 45))
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    )
                )
            );

        await interaction.showModal(modal);
    },
};
