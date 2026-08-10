import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, MessageFlags } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { BRANCH_CONFIG } from "@config";
import { PROJECT_REVIEW_MESSAGES } from "@constants";
import { Logger } from "@logger";
import { sanitizeProject } from "@bot/utils/dev/sanitize-project";

export default {
    customId: /^project_done_.*$/,
    async run(interaction: ButtonInteraction) {
        if (!interaction.isButton()) return;
        await interaction.deferUpdate();

        const pendingId = interaction.customId.replace("project_done_", "");
        const project = await ProjectShareRepository.findPendingById(pendingId);

        if (!project) {
            return interaction.followUp({ content: PROJECT_REVIEW_MESSAGES.notFoundOrSubmitted, flags: MessageFlags.Ephemeral });
        }

        sanitizeProject(project);

        if (project.type === "member") {
            try {
                const channel = await interaction.client.channels.fetch(BRANCH_CONFIG.channels.devProjectReview) as TextChannel;
                if (channel) {
                    const none = PROJECT_REVIEW_MESSAGES.noneValue;
                    const embed = new EmbedBuilder()
                        .setTitle(PROJECT_REVIEW_MESSAGES.submissionEmbedTitle)
                        .setDescription(PROJECT_REVIEW_MESSAGES.submissionEmbedDescription(
                            project.userId,
                            project.projectTitle,
                            project.projectDescription,
                            project.projectLinks.github || none,
                            project.projectLinks.other || none,
                            project.youtubeTutorialLink || none,
                            project.envFileLink || none,
                        ))
                        .setColor("Yellow");
                    if (project.imageLink) embed.setImage(project.imageLink);

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`review_accept_${project._id}`).setLabel(PROJECT_REVIEW_MESSAGES.acceptButtonLabel).setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`review_refuse_${project._id}`).setLabel(PROJECT_REVIEW_MESSAGES.refuseButtonLabel).setStyle(ButtonStyle.Danger)
                    );

                    await channel.send({
                        content: PROJECT_REVIEW_MESSAGES.submissionNotice(project.userId),
                        embeds: [embed],
                        components: [row],
                    });
                    await interaction.followUp({ content: PROJECT_REVIEW_MESSAGES.submittedForReview, flags: MessageFlags.Ephemeral });
                }
            } catch (err) {
                Logger.error(`Failed to send project for review: ${err}`, "DevBot");
                await interaction.followUp({ content: PROJECT_REVIEW_MESSAGES.reviewSendError, flags: MessageFlags.Ephemeral });
            }
        } else {
            await ProjectShareRepository.createPublishedFromPending(project);
            await ProjectShareRepository.deletePendingById(pendingId);
            await interaction.followUp({ content: PROJECT_REVIEW_MESSAGES.published(project.type), flags: MessageFlags.Ephemeral });
        }

        await interaction.deleteReply();
    }
};
