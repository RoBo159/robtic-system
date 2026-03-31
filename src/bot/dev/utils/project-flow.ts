import { ContainerBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, GuildMember } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";

export async function buildProjectContainer(pendingId: string, member: GuildMember) {
    const project = await ProjectShareRepository.findPendingById(pendingId);
    if (!project) return null;

    const isGithub = project.projectLinks.github && project.projectLinks.github.length > 0;
    
    // Create options based on current state
    const linkOptionName = isGithub ? "Add Additional Link" : "Add Github Link";
    
    const menuOptions = [
        { label: "Tutorial Link", description: project.youtubeTutorialLink ? "Edit or Delete Tutorial" : "Add YouTube Tutorial", value: "tutorial" },
        { label: linkOptionName, description: isGithub ? "Has Github, add other link" : "Has other link, add github", value: "additional_link" },
        { label: ".env File", description: project.envFileLink ? "Edit or Delete .env" : "Add .env file information", value: "env" },
        { label: "Upload Image", description: project.imageLink ? "Update image" : "Add preview image", value: "image" }
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`project_edit_${pendingId}`)
        .setPlaceholder("Enhance your project submission...")
        .addOptions(menuOptions);

    const doneBtn = new ButtonBuilder()
        .setCustomId(`project_done_${pendingId}`)
        .setLabel("Done")
        .setStyle(ButtonStyle.Success);

    const container = new ContainerBuilder()
        .setAccentColor(0x0099ff)
        .addTextDisplayComponents(t => t.setContent(
            `**Project Submission in Progress**\n\n**Title:** ${project.projectTitle}\n**Description:** ${project.projectDescription}\n**Type:** ${project.projectType}\n**Current Type:** ${project.type}\n\n*Select options below to add more details or click Done.*`
        ))
        .addActionRowComponents(row => row.setComponents(selectMenu))
        .addSeparatorComponents(s => s)
        .addSectionComponents(sec => sec
            .addTextDisplayComponents(t => t.setContent("Ready to submit?"))
            .setButtonAccessory(b => doneBtn)
        );

    return container;
}
