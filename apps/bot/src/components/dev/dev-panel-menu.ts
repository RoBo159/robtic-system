import { ContainerBuilder, MessageFlags, TextDisplayBuilder, type StringSelectMenuInteraction } from "discord.js";
import type { ProjectType } from "@database/models/ProjectShare";
import { Logger } from "@logger";
import { PROJECT_BROWSER_MESSAGES } from "@constants";
import { buildProjectPage, buildProjectReplyComponents, setState, type BrowserState } from "@bot/utils/dev/project-browser";

export default {
    customId: "dev_projects_menu",
    async run(interaction: StringSelectMenuInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const selectedType = interaction.values[0] as ProjectType;
        const state: BrowserState = { type: selectedType, page: 1, query: "" };
        setState(interaction.user.id, state);

        const page = await buildProjectPage(state);

        try {
            await interaction.editReply({
                content: null,
                embeds: [],
                flags: MessageFlags.IsComponentsV2,
                components: buildProjectReplyComponents(state.type, page.container, page.hasPrev, page.hasNext, page.projects),
            });
        } catch (error) {
            Logger.error(error, "Dev Project Share");

            const fallback = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    [
                        `## ${PROJECT_BROWSER_MESSAGES.titleByType[state.type]}`,
                        PROJECT_BROWSER_MESSAGES.renderFailedHeading,
                        PROJECT_BROWSER_MESSAGES.renderFailedHint,
                    ].join("\n")
                )
            );

            await interaction.editReply({
                content: null,
                embeds: [],
                flags: MessageFlags.IsComponentsV2,
                components: [fallback.toJSON()],
            }).catch(() => null);
        }
    }
};
