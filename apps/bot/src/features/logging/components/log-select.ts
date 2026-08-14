import {
    type StringSelectMenuInteraction,
    type ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS, LOG_REGISTRY, LOG_SETUP_MESSAGES, SNOWFLAKE_INPUT_LENGTH, type LogKey } from "@constants";
import { LogConfigRepository } from "@database/repositories";

export const setupLogSelectHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^setup_log_select$/,

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        const key = interaction.values[0] as LogKey;
        const meta = LOG_REGISTRY[key];

        const existing = await LogConfigRepository.findByKey(key);
        if (existing) {
            const guild = client.guilds.cache.get(existing.serverId);

            const embed = new EmbedBuilder()
                .setTitle(LOG_SETUP_MESSAGES.alreadyConfiguredTitle)
                .setColor(COLORS.warning)
                .setDescription(LOG_SETUP_MESSAGES.alreadyConfiguredDescription(
                    meta.label,
                    guild?.name ?? existing.serverId,
                    `<#${existing.channelId}>`,
                ))
                .setTimestamp();

            const overrideBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_log_override_${key}`)
                    .setLabel(LOG_SETUP_MESSAGES.overrideButtonLabel)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(LOG_SETUP_MESSAGES.overrideButtonEmoji),
            );

            await interaction.update({ embeds: [embed], components: [overrideBtn], content: null });
            return;
        }

        await showSetupLogModal(interaction, key);
    },
};

export const setupLogOverrideHandler: ComponentHandler<ButtonInteraction> = {
    customId: /^setup_log_override_.+$/,

    async run(interaction: ButtonInteraction, _client: BotClient) {
        const key = interaction.customId.replace("setup_log_override_", "") as LogKey;
        await showSetupLogModal(interaction, key);
    },
};

async function showSetupLogModal(
    interaction: StringSelectMenuInteraction | ButtonInteraction,
    key: LogKey,
): Promise<void> {
    const meta = LOG_REGISTRY[key];

    const modal = new ModalBuilder()
        .setCustomId(`setup_log_modal_${key}`)
        .setTitle(LOG_SETUP_MESSAGES.modalTitle(meta.label));

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
}
