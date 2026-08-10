import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { Logger } from "@logger";
import { PROJECT_BROWSER_MESSAGES } from "@constants";
import { buildPublishedProjectContainer } from "@bot/utils/dev/published-project";

export default {
    customId: "dev_projects_get_select",
    async run(interaction: StringSelectMenuInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const code = interaction.values[0];
        const project = await ProjectShareRepository.findPublishedByProjectId(code);

        if (!project) {
            return interaction.editReply({ content: PROJECT_BROWSER_MESSAGES.projectNotFound });
        }

        await project.updateOne({ $inc: { views: 1 } });

        const container = buildPublishedProjectContainer(project, interaction.user.id, interaction);

        try {
            await interaction.editReply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (err) {
            Logger.error(err, "Dev Project Share");
            await interaction.editReply({ content: PROJECT_BROWSER_MESSAGES.detailRenderError });
        }
    }
};
