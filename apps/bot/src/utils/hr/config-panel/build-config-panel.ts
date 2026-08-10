import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    RoleSelectMenuBuilder,
    type BaseMessageOptions,
} from "discord.js";
import { COLORS, SUBMIT_CONFIG_MESSAGES, SUBMIT_CONFIG_MAX_ROLES } from "@constants";
import type { ISubmissionType } from "@database/models/SubmissionType";

export function buildConfigPanel(type: ISubmissionType): BaseMessageOptions {
    const grantRoles = type.grantRoleIds.length
        ? type.grantRoleIds.map(id => `<@&${id}>`).join(", ")
        : SUBMIT_CONFIG_MESSAGES.noneSet;

    const managerRoles = type.managerRoleIds.length
        ? type.managerRoleIds.map(id => `<@&${id}>`).join(", ")
        : SUBMIT_CONFIG_MESSAGES.noneSet;

    const questions = type.questions.length
        ? type.questions.map((q, i) => `**${i + 1}.** ${q.question}`).join("\n")
        : SUBMIT_CONFIG_MESSAGES.noQuestions;

    const embed = new EmbedBuilder()
        .setTitle(SUBMIT_CONFIG_MESSAGES.panelTitle(type.name))
        .setColor(COLORS.info)
        .addFields(
            { name: SUBMIT_CONFIG_MESSAGES.statusFieldName, value: type.isOpen ? SUBMIT_CONFIG_MESSAGES.statusOpen : SUBMIT_CONFIG_MESSAGES.statusClosed, inline: true },
            { name: SUBMIT_CONFIG_MESSAGES.grantRolesFieldName, value: grantRoles, inline: false },
            { name: SUBMIT_CONFIG_MESSAGES.managerRolesFieldName, value: managerRoles, inline: false },
            { name: SUBMIT_CONFIG_MESSAGES.questionsFieldName, value: questions, inline: false },
        )
        .setFooter({ text: SUBMIT_CONFIG_MESSAGES.keyFooter(type.key) });

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`submit-config-rename_${type.key}`)
            .setLabel(SUBMIT_CONFIG_MESSAGES.renameButtonLabel)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`submit-config-questions_${type.key}`)
            .setLabel(SUBMIT_CONFIG_MESSAGES.editQuestionsButtonLabel)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`submit-config-toggle_${type.key}`)
            .setLabel(type.isOpen ? SUBMIT_CONFIG_MESSAGES.closeButtonLabel : SUBMIT_CONFIG_MESSAGES.openButtonLabel)
            .setStyle(type.isOpen ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`submit-config-delete_${type.key}`)
            .setLabel(SUBMIT_CONFIG_MESSAGES.deleteButtonLabel)
            .setStyle(ButtonStyle.Danger),
    );

    const grantRoleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId(`submit-config-grant-roles_${type.key}`)
            .setPlaceholder(SUBMIT_CONFIG_MESSAGES.grantRolesPlaceholder)
            .setMinValues(0)
            .setMaxValues(SUBMIT_CONFIG_MAX_ROLES)
            .setDefaultRoles(type.grantRoleIds)
    );

    const managerRoleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId(`submit-config-manager-roles_${type.key}`)
            .setPlaceholder(SUBMIT_CONFIG_MESSAGES.managerRolesPlaceholder)
            .setMinValues(0)
            .setMaxValues(SUBMIT_CONFIG_MAX_ROLES)
            .setDefaultRoles(type.managerRoleIds)
    );

    return { embeds: [embed], components: [buttonRow, grantRoleRow, managerRoleRow] };
}
