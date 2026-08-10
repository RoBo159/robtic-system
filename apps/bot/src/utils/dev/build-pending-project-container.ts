import { ContainerBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { PROJECT_ACCENT_COLOR, PROJECT_FLOW_MESSAGES } from "@constants";

/** The editable submission card shown to a user while their project is still pending. */
export async function buildPendingProjectContainer(pendingId: string) {
    const project = await ProjectShareRepository.findPendingById(pendingId);
    if (!project) return null;

    const isGithub = Boolean(project.projectLinks.github && project.projectLinks.github.length > 0);
    const menu = PROJECT_FLOW_MESSAGES.menu;

    const menuOptions = [
        {
            label: menu.tutorial.label,
            description: project.youtubeTutorialLink ? menu.tutorial.editDescription : menu.tutorial.addDescription,
            value: "tutorial",
        },
        {
            label: isGithub ? menu.additionalLink.otherLabel : menu.additionalLink.githubLabel,
            description: isGithub ? menu.additionalLink.hasGithubDescription : menu.additionalLink.noGithubDescription,
            value: "additional_link",
        },
        {
            label: menu.env.label,
            description: project.envFileLink ? menu.env.editDescription : menu.env.addDescription,
            value: "env",
        },
        {
            label: menu.image.label,
            description: project.imageLink ? menu.image.editDescription : menu.image.addDescription,
            value: "image",
        },
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`project_edit_${pendingId}`)
        .setPlaceholder(PROJECT_FLOW_MESSAGES.selectPlaceholder)
        .addOptions(menuOptions);

    const doneBtn = new ButtonBuilder()
        .setCustomId(`project_done_${pendingId}`)
        .setLabel(PROJECT_FLOW_MESSAGES.doneButtonLabel)
        .setStyle(ButtonStyle.Success);

    return new ContainerBuilder()
        .setAccentColor(PROJECT_ACCENT_COLOR)
        .addTextDisplayComponents(t => t.setContent(
            PROJECT_FLOW_MESSAGES.inProgress(
                project.projectTitle,
                project.projectDescription,
                project.projectType,
                project.type,
            )
        ))
        .addActionRowComponents(row => row.setComponents(selectMenu))
        .addSeparatorComponents(s => s)
        .addSectionComponents(sec => sec
            .addTextDisplayComponents(t => t.setContent(PROJECT_FLOW_MESSAGES.readyPrompt))
            .setButtonAccessory(() => doneBtn)
        );
}
