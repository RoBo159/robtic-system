import { MessageFlags, type ButtonInteraction } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { PROJECT_BROWSER_MESSAGES } from "@constants";
import { buildPublishedProjectContainer, extractProjectIdFromReaction } from "@bot/features/dev/utils/published-project";

export default {
    customId: /^dev_projects_dislike:.+$/,
    async run(interaction: ButtonInteraction) {
        await interaction.deferUpdate();

        const projectId = extractProjectIdFromReaction(interaction.customId);
        if (!projectId) {
            await interaction.followUp({ content: PROJECT_BROWSER_MESSAGES.invalidProjectAction, flags: MessageFlags.Ephemeral });
            return;
        }

        const project = await ProjectShareRepository.setReaction(projectId, interaction.user.id, "dislike");
        if (!project) {
            await interaction.followUp({ content: PROJECT_BROWSER_MESSAGES.projectNotFound, flags: MessageFlags.Ephemeral });
            return;
        }

        const container = buildPublishedProjectContainer(project, interaction.user.id, interaction);
        await interaction.editReply({ components: [container] });
    }
};
