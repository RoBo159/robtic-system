import { ButtonBuilder, ButtonStyle } from "discord.js";
import type { IProject } from "@database/models/ProjectShare";
import { PROJECT_BROWSER_MESSAGES } from "@constants";

export function buildReactionButtons(project: IProject, viewerId: string) {
    const liked = project.likes.includes(viewerId);
    const disliked = project.dislikes.includes(viewerId);

    return [
        new ButtonBuilder()
            .setCustomId(`dev_projects_like:${project.projectId}`)
            .setLabel(PROJECT_BROWSER_MESSAGES.likeButtonLabel(project.likes.length))
            .setStyle(ButtonStyle.Success)
            .setDisabled(liked),

        new ButtonBuilder()
            .setCustomId(`dev_projects_view:${project.projectId}`)
            .setLabel(PROJECT_BROWSER_MESSAGES.viewsButtonLabel(project.views))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId(`dev_projects_dislike:${project.projectId}`)
            .setLabel(PROJECT_BROWSER_MESSAGES.dislikeButtonLabel(project.dislikes.length))
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disliked),
    ];
}
