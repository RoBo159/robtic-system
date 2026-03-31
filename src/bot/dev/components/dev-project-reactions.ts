import { ButtonBuilder, ButtonInteraction, ButtonStyle, ContainerBuilder, MessageFlags, StringSelectMenuInteraction } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import type { IProject } from "@database/models/ProjectShare";
import emoji from "@shared/emojis.json";

function buildReactionButtons(project: IProject, viewerId: string) {
    const liked = project.likes.includes(viewerId);
    const disliked = project.dislikes.includes(viewerId);

    return [
        new ButtonBuilder()
            .setCustomId(`dev_projects_like:${project.projectId}`)
            .setLabel(`Like (${project.likes.length})`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(liked),

        new ButtonBuilder()
            .setCustomId(`dev_projects_view:${project.projectId}`)
            .setLabel(`Views (${project.views})`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId(`dev_projects_dislike:${project.projectId}`)
            .setLabel(`Dislike (${project.dislikes.length})`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disliked),
    ];
}

export function buildProjectContainer(project: IProject, viewerId: string, interaction: ButtonInteraction | StringSelectMenuInteraction) {
    const usericon = interaction.client.users.cache.get(project.userId)?.displayAvatarURL() || "https://raw.githubusercontent.com/RoBo159/assets/refs/heads/main/utils/discord/user.png";

    const container = new ContainerBuilder()
        .setAccentColor(0x0099ff)
        .addTextDisplayComponents(td =>
            td.setContent(`**## ${project.projectTitle}**`),
            td => td.setContent(`**${project.projectDescription}**`)
        )
        .addSeparatorComponents()
        .addSectionComponents(sc =>
            sc.addTextDisplayComponents(
                td => td.setContent(`**${emoji.dots}Project Author:** <@${project.userId}> \n**${emoji.dots}Project Type:** ${project.projectType} \n**${emoji.dots}Send at:** ${project.createdAt.toLocaleString()}`),
                td => td.setContent("**## Project Links:**")
            ).setThumbnailAccessory(thumb =>
                thumb.setURL(usericon)
            )
        )

    if (project.projectLinks.github) {
        container.addSectionComponents(sc =>
            sc.addTextDisplayComponents(
                td => td.setContent(`**${emoji.share} GitHub:**`)
            )
                .setButtonAccessory(btn =>
                    btn.setLabel("View")
                        .setStyle(ButtonStyle.Link)
                        .setURL(project.projectLinks.github!)
                )
        );
    }

    if (project.projectLinks.liveDemo) {
        container.addSectionComponents(sc =>
            sc.addTextDisplayComponents(
                td => td.setContent(`**${emoji.share} Live Demo:**`)
            )
                .setButtonAccessory(btn =>
                    btn.setLabel("View")
                        .setStyle(ButtonStyle.Link)
                        .setURL(project.projectLinks.liveDemo!)
                )
        );
    }

    if (project.projectLinks.other) {
        container.addSectionComponents(sc =>
            sc.addTextDisplayComponents(
                td => td.setContent(`**${emoji.share} Other Link:**`)
            )
                .setButtonAccessory(btn =>
                    btn.setLabel("View")
                        .setStyle(ButtonStyle.Link)
                        .setURL(project.projectLinks.other!)
                )
        );
    }

    if (project.youtubeTutorialLink) {
        container.addSectionComponents(sc =>
            sc.addTextDisplayComponents(
                td => td.setContent(`**${emoji.youtube} YouTube Tutorial:**`)
            )
                .setButtonAccessory(btn =>
                    btn.setLabel("View")
                        .setStyle(ButtonStyle.Link)
                        .setURL(project.youtubeTutorialLink!)
                )
        );
    }

    container.addMediaGalleryComponents(mg =>
        mg.addItems(
            item => item.setURL("https://raw.githubusercontent.com/RoBo159/assets/refs/heads/main/utils/discord/line.png")
                .setDescription("Project Separator"),
        )
    );

    container
        .addSeparatorComponents()
        .addActionRowComponents(ar =>
            ar.addComponents(...buildReactionButtons(project, viewerId))
        );

    return container;
}

function extractProjectIdFromReaction(customId: string): string | null {
    const parts = customId.split(":");
    if (parts.length < 2) return null;
    const projectId = parts.slice(1).join(":").trim().toLowerCase();
    return projectId.length > 0 ? projectId : null;
}

export const devPanelLikeButton = {
    customId: /^dev_projects_like:.+$/,
    async run(interaction: ButtonInteraction) {
        await interaction.deferUpdate();

        const projectId = extractProjectIdFromReaction(interaction.customId);
        if (!projectId) {
            await interaction.followUp({ content: "Invalid project action.", flags: MessageFlags.Ephemeral });
            return;
        }

        const project = await ProjectShareRepository.setReaction(projectId, interaction.user.id, "like");
        if (!project) {
            await interaction.followUp({ content: "Project not found.", flags: MessageFlags.Ephemeral });
            return;
        }

        const container = buildProjectContainer(project, interaction.user.id, interaction);
        await interaction.editReply({ components: [container] });
    }
};

export const devPanelDislikeButton = {
    customId: /^dev_projects_dislike:.+$/,
    async run(interaction: ButtonInteraction) {
        await interaction.deferUpdate();

        const projectId = extractProjectIdFromReaction(interaction.customId);
        if (!projectId) {
            await interaction.followUp({ content: "Invalid project action.", flags: MessageFlags.Ephemeral });
            return;
        }

        const project = await ProjectShareRepository.setReaction(projectId, interaction.user.id, "dislike");
        if (!project) {
            await interaction.followUp({ content: "Project not found.", flags: MessageFlags.Ephemeral });
            return;
        }

        const container = buildProjectContainer(project, interaction.user.id, interaction);
        await interaction.editReply({ components: [container] });
    }
};
