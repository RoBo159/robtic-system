import { StringSelectMenuInteraction, MessageFlags } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { buildPendingProjectContainer } from "@bot/features/dev/utils/build-pending-project-container";

export default {
    customId: /^project_sys_type_.*$/,
    async run(interaction: StringSelectMenuInteraction) {
        await interaction.deferUpdate();
        const pendingId = interaction.customId.replace("project_sys_type_", "");
        const selectedType = interaction.values[0];

        await ProjectShareRepository.updatePendingById(pendingId, { type: selectedType });

        const container = await buildPendingProjectContainer(pendingId);
        if (container) {
            await interaction.editReply({ components: [container], embeds: [], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    }
};
