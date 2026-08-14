import { Logger } from "@logger";
import { MessageFlags, ModalSubmitInteraction, GuildMember, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { ProjectType } from "@database/models/ProjectShare";
import { GENERIC_URL_REGEX, PROJECT_ID_LENGTH, PROJECT_SHARE_MODAL, PROJECT_SHARE_TYPE_PROMPT } from "@constants";
import { isOwner, isGuildOperator, isStaff } from "@bot/utils/access";
import { buildPendingProjectContainer } from "@bot/utils/dev/build-pending-project-container";
import { normalizeProjectType } from "@bot/utils/dev/sanitize-project";

export default {
    customId: PROJECT_SHARE_MODAL.customId,
    async run(interaction: ModalSubmitInteraction) {
        if (!interaction.isModalSubmit()) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        Logger.debug(`Received modal submission for shareProject from ${interaction.user.tag}`, "DevBot");

        const title = interaction.fields.getTextInputValue("title");
        const description = interaction.fields.getTextInputValue("description");

        let typeStr = "other";
        try {
            const typeValues = interaction.fields.getStringSelectValues("type");
            typeStr = (typeValues && typeValues.length > 0) ? typeValues[0] : "other";
        } catch {
            typeStr = interaction.fields.getTextInputValue("type") || "other";
        }

        let link = interaction.fields.getTextInputValue("link") || "";
        if (link && !GENERIC_URL_REGEX.test(link)) {
            link = "";
        }

        const normalizedType = normalizeProjectType(typeStr);

        const member = interaction.member as GuildMember;
        let pType: ProjectType = ProjectType.Member;
        const isSystem = (await isOwner(member)) || isGuildOperator(member);

        if (isSystem) {
            pType = ProjectType.System;
        } else if (await isStaff(member)) {
            pType = ProjectType.Developer;
        }

        const newPending = await ProjectShareRepository.createPending({
            userId: interaction.user.id,
            type: pType,
            projectId: Math.random().toString(36).substring(2, 2 + PROJECT_ID_LENGTH),
            projectType: normalizedType,
            projectTitle: title,
            projectDescription: description,
            projectLinks: {
                github: link.includes("github.com") ? link : undefined,
                other: !link.includes("github.com") && link ? link : undefined,
            },
        });

        if (isSystem) {
            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`project_sys_type_${newPending._id}`)
                        .setPlaceholder(PROJECT_SHARE_TYPE_PROMPT.placeholder)
                        .addOptions([...PROJECT_SHARE_TYPE_PROMPT.options])
                );

            const embed = new EmbedBuilder()
                .setTitle(PROJECT_SHARE_TYPE_PROMPT.title)
                .setDescription(PROJECT_SHARE_TYPE_PROMPT.description)
                .setColor("Blurple");

            await interaction.followUp({ embeds: [embed], components: [row] });
            return;
        }

        const container = await buildPendingProjectContainer(newPending._id.toString());
        if (container) {
            await interaction.followUp({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    }
};
