import type { ButtonInteraction } from "discord.js";
import { buildProjectPage, buildProjectReplyComponents, getState, setState } from "@bot/features/dev/utils/project-browser";

export default {
    customId: "dev_projects_next",
    async run(interaction: ButtonInteraction) {
        await interaction.deferUpdate();

        const current = getState(interaction.user.id);
        const nextState = { ...current, page: current.page + 1 };
        const page = await buildProjectPage(nextState);

        setState(interaction.user.id, { ...nextState, page: page.page });

        await interaction.message.edit({
            components: buildProjectReplyComponents(nextState.type, page.container, page.hasPrev, page.hasNext, page.projects),
        });
    }
};
