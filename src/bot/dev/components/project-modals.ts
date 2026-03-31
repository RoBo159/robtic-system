import { ModalSubmitInteraction, GuildMember, MessageFlags } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { buildProjectContainer } from "@bot/dev/utils/project-flow";

export default {
    customId: /^modal_(tutorial|link|env|image)_.*$/,
    async run(interaction: ModalSubmitInteraction) {
        if(!interaction.isModalSubmit()) return;
        await interaction.deferUpdate();

        const parts = interaction.customId.split("_");
        const type = parts[1]; // tutorial, link, env, image
        const pendingId = parts.slice(2).join("_");

        const project = await ProjectShareRepository.findPendingById(pendingId);
        if (!project) return;

        if (type === "tutorial") {
            let val = interaction.fields.getTextInputValue("tutorial_link");
            if (val && val.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/)) {
                project.youtubeTutorialLink = val;
            } else {
                project.youtubeTutorialLink = undefined;
            }
            await ProjectShareRepository.savePending(project);
        } else if (type === "link") {
            let val = interaction.fields.getTextInputValue("extra_link");
            const isGithub = project.projectLinks.github && project.projectLinks.github.length > 0;
            if (isGithub) {
                if (val && !val.match(/^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/)) {
                    project.projectLinks.other = undefined;
                } else {
                    project.projectLinks.other = val || undefined;
                }
            } else {
                if (val && val.match(/^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\/?$/)) {
                    project.projectLinks.github = val;
                } else {
                    project.projectLinks.github = undefined;
                }
            }
            await ProjectShareRepository.savePending(project);
        } else if (type === "env") {
            let val = interaction.fields.getTextInputValue("env_info");
            project.envFileLink = val;
            await ProjectShareRepository.savePending(project);
        } else if (type === "image") {
            // Check if it's text or file upload
            let val = "";
            try {
                // If it was a text input fallback
                val = interaction.fields.getTextInputValue("image_upload");
            } catch (e) {
                // If the new FileUpload is supported, they might be in attachments
                const attachment = interaction.fields.getUploadedFiles?.("image_upload");
                if (attachment) val = attachment.first()?.url ?? "";
            }
            project.imageLink = val;
            await ProjectShareRepository.savePending(project);
        }

        const container = await buildProjectContainer(pendingId, interaction.member as GuildMember);
        if (container) {
            await interaction.editReply({ components: [container], embeds: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }); 
        }
    }
}
