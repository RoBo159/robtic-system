import {
    ActionRowBuilder,
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { SubmissionTypeRepository, SubmitConfigRepository } from "@database/repositories";
import { buildConfigPanel, buildDeleteConfirmPanel } from "../../utils/hr/config-panel";
import { updatePanel } from "../../utils/hr/update-panel";
import { MAX_QUESTIONS } from "@database/repositories/SubmissionTypeRepository";

export default {
    customId: /^submit-config-(rename|questions|toggle|delete|delete-yes|delete-no)_/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const [, action, key] = interaction.customId.match(/^submit-config-(rename|questions|toggle|delete-yes|delete-no|delete)_(.+)$/) ?? [];
        const guildId = interaction.guildId!;

        const type = await SubmissionTypeRepository.get(guildId, key);
        if (!type) {
            await interaction.reply({ content: "❌ This submission type no longer exists.", flags: MessageFlags.Ephemeral });
            return;
        }

        if (action === "rename") {
            const modal = new ModalBuilder()
                .setCustomId(`submit-config-rename-modal_${key}`)
                .setTitle("Rename Submission Type")
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId("name")
                            .setLabel("Name")
                            .setStyle(TextInputStyle.Short)
                            .setValue(type.name)
                            .setMaxLength(45)
                            .setRequired(true)
                    )
                );
            await interaction.showModal(modal);
            return;
        }

        if (action === "questions") {
            const rows: ActionRowBuilder<TextInputBuilder>[] = [];
            for (let i = 0; i < MAX_QUESTIONS; i++) {
                const existing = type.questions[i];
                const input = new TextInputBuilder()
                    .setCustomId(`q${i + 1}`)
                    .setLabel(`Question ${i + 1}${i === 0 ? "" : " (optional)"}`)
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(45)
                    .setRequired(i === 0);
                if (existing) input.setValue(existing.question);
                rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
            }

            const modal = new ModalBuilder()
                .setCustomId(`submit-config-questions-modal_${key}`)
                .setTitle(`${type.name} — Questions (max ${MAX_QUESTIONS})`)
                .addComponents(...rows);

            await interaction.showModal(modal);
            return;
        }

        if (action === "toggle") {
            const updated = await SubmissionTypeRepository.setOpen(guildId, key, !type.isOpen);
            if (!updated) return;

            const config = await SubmitConfigRepository.get(guildId);
            if (config) await updatePanel(client, config);

            await interaction.update(buildConfigPanel(updated));
            return;
        }

        if (action === "delete") {
            await interaction.update(buildDeleteConfirmPanel(type));
            return;
        }

        if (action === "delete-no") {
            await interaction.update(buildConfigPanel(type));
            return;
        }

        if (action === "delete-yes") {
            await SubmissionTypeRepository.remove(guildId, key);

            const config = await SubmitConfigRepository.get(guildId);
            if (config) await updatePanel(client, config);

            await interaction.update({ content: `🗑️ **${type.name}** has been deleted.`, embeds: [], components: [] });
            return;
        }
    },
};
