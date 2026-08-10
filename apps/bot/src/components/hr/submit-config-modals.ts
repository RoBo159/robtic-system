import { ModalSubmitInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { SubmissionTypeRepository, SubmitConfigRepository } from "@database/repositories";
import { buildConfigPanel } from "../../utils/hr/config-panel";
import { updatePanel } from "../../utils/hr/update-panel";
import { MAX_QUESTIONS } from "@database/repositories/SubmissionTypeRepository";

export default {
    customId: /^submit-config-(rename|questions)-modal_/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        if (!interaction.isFromMessage()) return;
        await interaction.deferUpdate();

        const [, action, key] = interaction.customId.match(/^submit-config-(rename|questions)-modal_(.+)$/) ?? [];
        const guildId = interaction.guildId!;

        const type = await SubmissionTypeRepository.get(guildId, key);
        if (!type) {
            await interaction.followUp({ content: "❌ This submission type no longer exists.", flags: MessageFlags.Ephemeral });
            return;
        }

        if (action === "rename") {
            const name = interaction.fields.getTextInputValue("name");
            const updated = await SubmissionTypeRepository.rename(guildId, key, name);
            if (!updated) return;

            const config = await SubmitConfigRepository.get(guildId);
            if (config) await updatePanel(client, config);

            await interaction.editReply(buildConfigPanel(updated));
            return;
        }

        if (action === "questions") {
            const questions: string[] = [];
            for (let i = 0; i < MAX_QUESTIONS; i++) {
                const value = interaction.fields.getTextInputValue(`q${i + 1}`)?.trim();
                if (value) questions.push(value);
            }

            const updated = await SubmissionTypeRepository.setQuestions(guildId, key, questions);
            if (!updated) return;

            await interaction.editReply(buildConfigPanel(updated));
            return;
        }
    },
};
