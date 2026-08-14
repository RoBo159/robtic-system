import {
    SlashCommandBuilder,
    ComponentType,
    MessageFlags,
    type ChatInputCommandInteraction,
    type Message,
    type StringSelectMenuInteraction,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { DEFAULT_PREFIX, HELP } from "@constants";
import { ServerConfigRepository } from "@database/repositories";
import {
    buildOverviewEmbed,
    buildCategoryEmbed,
    buildCategoryRow,
    groupByCategory,
    sortedCategories,
} from "@bot/utils/help/build-help";

const COLLECTOR_IDLE_MS = 120_000;

/** Resolves a free-text category argument to a real category name (case-insensitive), or null. */
function resolveCategory(client: BotClient, input: string | null): string | null {
    if (!input) return null;
    const target = input.trim().toLowerCase();
    const categories = sortedCategories(groupByCategory(client));
    return categories.find(c => c.toLowerCase() === target) ?? null;
}

/**
 * `!help` / `/help`. Reads the live `client.commands` rather than a maintained list, so a new
 * command appears here the moment it loads, grouped by its `category` with a dropdown to browse.
 */
export default {
    scope: "guild",
    access: "general",
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("List every command, its usage and category")
        .addStringOption(opt =>
            opt.setName("category").setDescription("Jump straight to a category (e.g. moderation)").setRequired(false)
        ),

    category: HELP.generalCategory,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const prefix = interaction.guildId
            ? (await ServerConfigRepository.getPrefix(interaction.guildId)) ?? DEFAULT_PREFIX
            : DEFAULT_PREFIX;

        const initialCategory = resolveCategory(client, interaction.options.getString("category"));
        const embed = initialCategory
            ? buildCategoryEmbed(client, prefix, initialCategory)
            : buildOverviewEmbed(client, prefix);
        const row = buildCategoryRow(client, initialCategory ?? HELP.overviewSelectValue);

        await interaction.reply({ embeds: [embed], components: [row] });
        const message = (await interaction.fetchReply()) as Message | null;
        if (!message) return;

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            idle: COLLECTOR_IDLE_MS,
        });

        collector.on("collect", async (select: StringSelectMenuInteraction) => {
            // Only the person who opened the menu drives it.
            if (select.user.id !== interaction.user.id) {
                await select.reply({ content: HELP.pickPrompt, flags: MessageFlags.Ephemeral }).catch(() => null);
                return;
            }

            const choice = select.values[0];
            const nextEmbed = choice === HELP.overviewSelectValue
                ? buildOverviewEmbed(client, prefix)
                : buildCategoryEmbed(client, prefix, choice);

            await select
                .update({ embeds: [nextEmbed], components: [buildCategoryRow(client, choice)] })
                .catch(() => null);
        });

        collector.on("end", async () => {
            await message.edit({ components: [] }).catch(() => null);
        });
    },
};
