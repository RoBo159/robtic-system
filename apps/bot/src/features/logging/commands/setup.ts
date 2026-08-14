import {
    ActionRowBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { LOG_REGISTRY, LOG_SETUP_MESSAGES } from "@constants";

/** Opens the picker; the select and modal handlers in components/ carry the flow from there. */
export const setup: FeatureSubcommandHandler = async (interaction, _client) => {
    const options = Object.entries(LOG_REGISTRY).map(([key, meta]) =>
        new StringSelectMenuOptionBuilder().setValue(key).setLabel(meta.label).setDescription(meta.description)
    );

    const select = new StringSelectMenuBuilder()
        .setCustomId("setup_log_select")
        .setPlaceholder(LOG_SETUP_MESSAGES.selectPlaceholder)
        .addOptions(options);

    await interaction.reply({
        content: LOG_SETUP_MESSAGES.selectPrompt,
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
        flags: MessageFlags.Ephemeral,
    });
};
