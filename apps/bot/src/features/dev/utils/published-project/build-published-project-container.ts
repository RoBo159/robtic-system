import { ButtonStyle, ContainerBuilder, type ButtonInteraction, type StringSelectMenuInteraction } from "discord.js";
import type { IProject } from "@database/models/ProjectShare";
import { BRANCH_CONFIG } from "@config";
import { PROJECT_ACCENT_COLOR, PROJECT_BROWSER_MESSAGES, PROJECT_ASSET_PATHS } from "@constants";
import { buildReactionButtons } from "./build-reaction-buttons";

/** The read-only card for an already-published project, with reaction controls. */
export function buildPublishedProjectContainer(
    project: IProject,
    viewerId: string,
    interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
    const usericon = interaction.client.users.cache.get(project.userId)?.displayAvatarURL()
        || `${BRANCH_CONFIG.server.githubAssetsBase}${PROJECT_ASSET_PATHS.defaultUserIcon}`;

    const container = new ContainerBuilder()
        .setAccentColor(PROJECT_ACCENT_COLOR)
        .addTextDisplayComponents(
            td => td.setContent(`**## ${project.projectTitle}**`),
            td => td.setContent(`**${project.projectDescription}**`)
        )
        .addSeparatorComponents()
        .addSectionComponents(sc =>
            sc.addTextDisplayComponents(
                td => td.setContent(PROJECT_BROWSER_MESSAGES.authorLine(
                    project.userId,
                    project.projectType,
                    project.createdAt.toLocaleString(),
                )),
                td => td.setContent(PROJECT_BROWSER_MESSAGES.projectLinksHeading)
            ).setThumbnailAccessory(thumb => thumb.setURL(usericon))
        );

    const linkSections: Array<[string | undefined, string]> = [
        [project.projectLinks.github, PROJECT_BROWSER_MESSAGES.githubLinkLabel],
        [project.projectLinks.liveDemo, PROJECT_BROWSER_MESSAGES.liveDemoLinkLabel],
        [project.projectLinks.other, PROJECT_BROWSER_MESSAGES.otherLinkLabel],
        [project.youtubeTutorialLink, PROJECT_BROWSER_MESSAGES.youtubeLinkLabel],
    ];

    for (const [url, label] of linkSections) {
        if (!url) continue;
        container.addSectionComponents(sc =>
            sc.addTextDisplayComponents(td => td.setContent(label))
                .setButtonAccessory(btn =>
                    btn.setLabel(PROJECT_BROWSER_MESSAGES.viewButtonLabel)
                        .setStyle(ButtonStyle.Link)
                        .setURL(url)
                )
        );
    }

    container.addMediaGalleryComponents(mg =>
        mg.addItems(
            item => item.setURL(`${BRANCH_CONFIG.server.githubAssetsBase}${PROJECT_ASSET_PATHS.separatorLine}`)
                .setDescription(PROJECT_BROWSER_MESSAGES.separatorAltText),
        )
    );

    if (interaction.user.id === project.userId) {
        container.addSectionComponents(sc =>
            sc.addTextDisplayComponents(td => td.setContent(PROJECT_BROWSER_MESSAGES.ownProjectNotice))
                .setButtonAccessory(btn =>
                    btn.setCustomId(`dev_projects_config:${project.projectId}`)
                        .setLabel(PROJECT_BROWSER_MESSAGES.configButtonLabel)
                        .setStyle(ButtonStyle.Primary)
                )
        );
    }

    container
        .addSeparatorComponents()
        .addActionRowComponents(ar => ar.addComponents(...buildReactionButtons(project, viewerId)));

    return container;
}
