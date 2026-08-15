import {
    SlashCommandBuilder,
    ComponentType,
    MessageFlags,
    type ChatInputCommandInteraction,
    type Message,
    type StringSelectMenuInteraction,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { HELP } from "@constants";
import {
    buildOverviewEmbed,
    buildCategoryEmbed,
    buildCategoryRow,
    groupByCategory,
    sortedCategories,
} from "@bot/utils/help/build-help";
import { buildHelpContext, type HelpContext } from "@bot/utils/help/help-context";

const COLLECTOR_IDLE_MS = 120_000;

/** Resolves a free-text category argument to a real category name (case-insensitive), or null. */
function resolveCategory(client: BotClient, context: HelpContext, input: string | null): string | null {
    if (!input) return null;
    const target = input.trim().toLowerCase();
    return sortedCategories(groupByCategory(client, context)).find(c => c.toLowerCase() === target) ?? null;
}

/**
 * `!help` / `/help`.
 *
 * Reads the live command collection rather than a maintained list, so a command appears the moment
 * it loads. What it shows is scoped to the reader and the server: admin-scoped commands are hidden
 * from anyone who cannot run them, since they are only registered to the admin guild, and commands
 * from a switched-off feature are listed but marked — hiding those would leave an admin no way to
 * find out what enabling the feature would bring.
 */
export default {
    scope: "guild",
    access: "general",
    category: HELP.generalCategory,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("List every command, its usage and category")
        .addStringOption(opt =>
            opt.setName("category").setDescription("Jump straight to a category (e.g. moderation)").setRequired(false)
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const context = await buildHelpContext(client, interaction.guildId, interaction.user.id);

        const initial = resolveCategory(client, context, interaction.options.getString("category"));
        const embed = initial ? buildCategoryEmbed(client, context, initial) : buildOverviewEmbed(client, context);

        await interaction.reply({
            embeds: [embed],
            components: [buildCategoryRow(client, context, initial ?? HELP.overviewSelectValue)],
        });

        const message = (await interaction.fetchReply()) as Message | null;
        if (!message) return;

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            idle: COLLECTOR_IDLE_MS,
        });

        collector.on("collect", async (select: StringSelectMenuInteraction) => {
            // Only the person who opened the menu drives it — the context was resolved for them.
            if (select.user.id !== interaction.user.id) {
                await select.reply({ content: HELP.pickPrompt, flags: MessageFlags.Ephemeral }).catch(() => null);
                return;
            }

            const choice = select.values[0]!;
            const next = choice === HELP.overviewSelectValue
                ? buildOverviewEmbed(client, context)
                : buildCategoryEmbed(client, context, choice);

            await select
                .update({ embeds: [next], components: [buildCategoryRow(client, context, choice)] })
                .catch(() => null);
        });

        collector.on("end", async () => {
            await message.edit({ components: [] }).catch(() => null);
        });
    },
};
