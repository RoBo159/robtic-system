import { RoleSelectMenuInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { SubmissionTypeRepository } from "@database/repositories";
import { buildConfigPanel } from "../../utils/hr/config-panel";

export default {
    customId: /^submit-config-(grant-roles|manager-roles)_/,

    async run(interaction: RoleSelectMenuInteraction, client: BotClient) {
        await interaction.deferUpdate();

        const [, action, key] = interaction.customId.match(/^submit-config-(grant-roles|manager-roles)_(.+)$/) ?? [];
        const guildId = interaction.guildId!;
        const roleIds = interaction.values;

        const updated = action === "grant-roles"
            ? await SubmissionTypeRepository.setGrantRoles(guildId, key, roleIds)
            : await SubmissionTypeRepository.setManagerRoles(guildId, key, roleIds);

        if (!updated) return;

        await interaction.editReply(buildConfigPanel(updated));
    },
};
