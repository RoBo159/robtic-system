import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, MessageFlags } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import channels from "@shared/channel.json";

export default {
    customId: /^project_done_.*$/,
    async run(interaction: ButtonInteraction) {
        if(!interaction.isButton()) return;
        await interaction.deferUpdate();

        const pendingId = interaction.customId.replace("project_done_", "");
        const project = await ProjectShareRepository.findPendingById(pendingId);

        if (!project) return interaction.followUp({ content: "Project not found or already submitted.", flags: MessageFlags.Ephemeral });
        // Sanitization of old data
        const validTypes = ["web", "discord", "other"];
        let pType = project.projectType.toLowerCase();
        if (pType.startsWith('w')) pType = 'web';
        else if (pType.startsWith('d')) pType = 'discord';
        else pType = 'other';
        if (!validTypes.includes(pType)) pType = "other";
        project.projectType = pType;

        const urlRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/;
        if (project.projectLinks.github && !project.projectLinks.github.match(urlRegex)) project.projectLinks.github = undefined;
        if (project.projectLinks.other && !project.projectLinks.other.match(urlRegex)) project.projectLinks.other = undefined;
        if (project.projectLinks.liveDemo && !project.projectLinks.liveDemo.match(urlRegex)) project.projectLinks.liveDemo = undefined;
        if (project.youtubeTutorialLink && !project.youtubeTutorialLink.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/)) project.youtubeTutorialLink = undefined;
    

        // If member, send for review
        if (project.type === "member") {
            try {
                const channel = await interaction.client.channels.fetch(channels.memberProjectReview) as TextChannel;
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle("New Project Submission")
                        .setDescription(`**User:** <@${project.userId}>\n**Title:** ${project.projectTitle}\n**Description:** ${project.projectDescription}\n**Links:**\nGitHub: ${project.projectLinks.github || "None"}\nOther: ${project.projectLinks.other || "None"}\nYouTube: ${project.youtubeTutorialLink || "None"}\n.env: ${project.envFileLink || "None"}`)
                        .setColor("Yellow");
                    if (project.imageLink) embed.setImage(project.imageLink);

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`review_accept_${project._id}`).setLabel("Accept").setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`review_refuse_${project._id}`).setLabel("Refuse").setStyle(ButtonStyle.Danger)
                    );

                    await channel.send({ content: `New submission from <@${project.userId}>`, embeds: [embed], components: [row] });
                    await interaction.followUp({ content: "Your project has been submitted for review.", flags: MessageFlags.Ephemeral });
                }
            } catch (err) {
                console.error(err);
                await interaction.followUp({ content: "Error sending for review. Please contact staff.", flags: MessageFlags.Ephemeral });
            }
        } else {
            // Dev Staff or System
            await ProjectShareRepository.createPublishedFromPending(project);
            await ProjectShareRepository.deletePendingById(pendingId);
            await interaction.followUp({ content: `Your ${project.type} project has been successfully published!`, flags: MessageFlags.Ephemeral });
        }
        
        // Remove the container from user DM/channel
        await interaction.deleteReply();
    }
}
