import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    type BaseMessageOptions,
} from "discord.js";
import { COLORS, SUBMIT_CONFIG_MESSAGES } from "@constants";
import type { ISubmissionType } from "@database/models/SubmissionType";

export function buildDeleteConfirmPanel(type: ISubmissionType): BaseMessageOptions {
    const embed = new EmbedBuilder()
        .setTitle(SUBMIT_CONFIG_MESSAGES.deleteConfirmTitle(type.name))
        .setDescription(SUBMIT_CONFIG_MESSAGES.deleteConfirmDescription)
        .setColor(COLORS.error);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`submit-config-delete-yes_${type.key}`)
            .setLabel(SUBMIT_CONFIG_MESSAGES.deleteConfirmYesLabel)
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`submit-config-delete-no_${type.key}`)
            .setLabel(SUBMIT_CONFIG_MESSAGES.deleteConfirmCancelLabel)
            .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row] };
}
