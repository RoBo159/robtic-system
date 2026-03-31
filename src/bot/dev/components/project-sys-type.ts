import { StringSelectMenuInteraction, MessageFlags, GuildMember } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { buildProjectContainer } from "@bot/dev/utils/project-flow";

export default {
    customId: /^project_sys_type_.*$/,
    async run(interaction: StringSelectMenuInteraction) {
        await interaction.deferUpdate();
        const pendingId = interaction.customId.replace("project_sys_type_", "");
        const selectedType = interaction.values[0];

        await ProjectShareRepository.updatePendingById(pendingId, { type: selectedType });

        const container = await buildProjectContainer(pendingId, interaction.member as GuildMember);
        if (container) {
            await interaction.editReply({ components: [container], embeds: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    }
}
