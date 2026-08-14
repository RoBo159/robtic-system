import { ModalSubmitInteraction, MessageFlags } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { GENERIC_URL_REGEX, YOUTUBE_URL_REGEX, GITHUB_URL_REGEX } from "@constants";
import { buildPendingProjectContainer } from "@bot/utils/dev/build-pending-project-container";

export default {
    customId: /^modal_(tutorial|link|env|image)_.*$/,
    async run(interaction: ModalSubmitInteraction) {
        if (!interaction.isModalSubmit()) return;
        await interaction.deferUpdate();

        const parts = interaction.customId.split("_");
        const type = parts[1];
        const pendingId = parts.slice(2).join("_");

        const project = await ProjectShareRepository.findPendingById(pendingId);
        if (!project) return;

        if (type === "tutorial") {
            const val = interaction.fields.getTextInputValue("tutorial_link");
            project.youtubeTutorialLink = val && YOUTUBE_URL_REGEX.test(val) ? val : undefined;
            await ProjectShareRepository.savePending(project);
        } else if (type === "link") {
            const val = interaction.fields.getTextInputValue("extra_link");
            const isGithub = Boolean(project.projectLinks.github && project.projectLinks.github.length > 0);
            if (isGithub) {
                project.projectLinks.other = val && GENERIC_URL_REGEX.test(val) ? val : undefined;
            } else {
                project.projectLinks.github = val && GITHUB_URL_REGEX.test(val) ? val : undefined;
            }
            await ProjectShareRepository.savePending(project);
        } else if (type === "env") {
            project.envFileLink = interaction.fields.getTextInputValue("env_info");
            await ProjectShareRepository.savePending(project);
        } else if (type === "image") {
            let val = "";
            try {
                val = interaction.fields.getTextInputValue("image_upload");
            } catch {
                const attachment = interaction.fields.getUploadedFiles?.("image_upload");
                if (attachment) val = attachment.first()?.url ?? "";
            }
            project.imageLink = val;
            await ProjectShareRepository.savePending(project);
        }

        const container = await buildPendingProjectContainer(pendingId);
        if (container) {
            await interaction.editReply({ components: [container], embeds: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    }
};
