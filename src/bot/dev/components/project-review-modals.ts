import { ModalSubmitInteraction, TextChannel, EmbedBuilder, MessageFlags } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import channels from "@shared/channel.json";

export default {
    customId: /^modal_review_(accept|refuse)_.*$/,
    async run(interaction: ModalSubmitInteraction) {
        if(!interaction.isModalSubmit()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const parts = interaction.customId.split("_");
        const action = parts[2];
        const pendingId = parts.slice(3).join("_");
        const reason = interaction.fields.getTextInputValue("reason");

        const project = await ProjectShareRepository.findPendingById(pendingId);
        if (!project) return interaction.followUp("Project not found in pending list.");
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
    

        const logChannel = await interaction.client.channels.fetch(channels.memberProjectLog) as TextChannel;

        if (action === "accept") {
            await ProjectShareRepository.createPublishedFromPending(project);
            await ProjectShareRepository.deletePendingById(pendingId);

            // Notify User
            try {
                const user = await interaction.client.users.fetch(project.userId);
                await user.send(`**Your project "${project.projectTitle}" has been accepted!**\n**Reason:** ${reason}`);
            } catch (e) {}

            // Log
            if (logChannel) {
                await logChannel.send({ embeds: [new EmbedBuilder().setTitle("Project Accepted").setDescription(`Project **${project.projectTitle}** by <@${project.userId}> was accepted.\n**Reason:** ${reason}`).setColor("Green")]});
            }
            await interaction.followUp("Project accepted and published!");
        } else {
            await ProjectShareRepository.deletePendingById(pendingId);

            // Notify User
            try {
                const user = await interaction.client.users.fetch(project.userId);
                await user.send(`**Your project "${project.projectTitle}" has been refused.**\n**Reason:** ${reason}`);
            } catch (e) {}

            // Log
            if (logChannel) {
                await logChannel.send({ embeds: [new EmbedBuilder().setTitle("Project Refused").setDescription(`Project **${project.projectTitle}** by <@${project.userId}> was refused.\n**Reason:** ${reason}`).setColor("Red")]});
            }
            await interaction.followUp("Project refused.");
        }

        // Try to update original message
        try {
            if (interaction.message) {
                await interaction.message.delete();
            }
        } catch (e) {}
    }
}
