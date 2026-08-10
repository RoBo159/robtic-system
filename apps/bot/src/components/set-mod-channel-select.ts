import {
    type StringSelectMenuInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { LOG_SETUP_MESSAGES, SNOWFLAKE_INPUT_LENGTH } from "@constants";

const MOD_CHANNEL_LABELS: Record<string, string> = {
    modmail: "ModMail Channel",
};

const setModChannelSelectHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^set_mod_channel_select$/,

    async run(interaction: StringSelectMenuInteraction, _client: BotClient) {
        const type = interaction.values[0];
        const label = MOD_CHANNEL_LABELS[type] ?? type;

        const modal = new ModalBuilder()
            .setCustomId(`set_mod_channel_modal_${type}`)
            .setTitle(`Set ${label}`);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("channel_id")
                    .setLabel(LOG_SETUP_MESSAGES.channelIdLabel)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder(LOG_SETUP_MESSAGES.channelIdPlaceholder)
                    .setMinLength(SNOWFLAKE_INPUT_LENGTH.min)
                    .setMaxLength(SNOWFLAKE_INPUT_LENGTH.max)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("server_id")
                    .setLabel(LOG_SETUP_MESSAGES.serverIdLabel)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder(LOG_SETUP_MESSAGES.serverIdPlaceholder)
                    .setMinLength(SNOWFLAKE_INPUT_LENGTH.min)
                    .setMaxLength(SNOWFLAKE_INPUT_LENGTH.max)
            ),
        );

        await interaction.showModal(modal);
    },
};

export default setModChannelSelectHandler;
