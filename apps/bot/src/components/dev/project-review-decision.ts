import { ModalSubmitInteraction, TextChannel, EmbedBuilder, MessageFlags } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { BRANCH_CONFIG } from "@config";
import { PROJECT_REVIEW_MESSAGES } from "@constants";
import { Logger } from "@logger";
import { sanitizeProject } from "@bot/utils/dev/sanitize-project";

export default {
    customId: /^modal_review_(accept|refuse)_.*$/,
    async run(interaction: ModalSubmitInteraction) {
        if (!interaction.isModalSubmit()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const parts = interaction.customId.split("_");
        const action = parts[2];
        const pendingId = parts.slice(3).join("_");
        const reason = interaction.fields.getTextInputValue("reason");

        const project = await ProjectShareRepository.findPendingById(pendingId);
        if (!project) return interaction.followUp(PROJECT_REVIEW_MESSAGES.notFoundInPending);

        sanitizeProject(project);

        const logChannel = await interaction.client.channels.fetch(BRANCH_CONFIG.channels.devProjectLog) as TextChannel;
        const accepted = action === "accept";

        if (accepted) {
            await ProjectShareRepository.createPublishedFromPending(project);
        }
        await ProjectShareRepository.deletePendingById(pendingId);

        try {
            const user = await interaction.client.users.fetch(project.userId);
            await user.send(accepted
                ? PROJECT_REVIEW_MESSAGES.acceptedDm(project.projectTitle, reason)
                : PROJECT_REVIEW_MESSAGES.refusedDm(project.projectTitle, reason));
        } catch (err) {
            Logger.debug(`Could not DM project decision to ${project.userId}: ${err}`, "DevBot");
        }

        if (logChannel) {
            await logChannel.send({
                embeds: [new EmbedBuilder()
                    .setTitle(accepted ? PROJECT_REVIEW_MESSAGES.acceptedLogTitle : PROJECT_REVIEW_MESSAGES.refusedLogTitle)
                    .setDescription(accepted
                        ? PROJECT_REVIEW_MESSAGES.acceptedLogDescription(project.projectTitle, project.userId, reason)
                        : PROJECT_REVIEW_MESSAGES.refusedLogDescription(project.projectTitle, project.userId, reason))
                    .setColor(accepted ? "Green" : "Red")],
            });
        }

        await interaction.followUp(accepted
            ? PROJECT_REVIEW_MESSAGES.acceptedConfirmation
            : PROJECT_REVIEW_MESSAGES.refusedConfirmation);

        try {
            if (interaction.message) {
                await interaction.message.delete();
            }
        } catch (err) {
            Logger.debug(`Could not delete review message: ${err}`, "DevBot");
        }
    }
};
