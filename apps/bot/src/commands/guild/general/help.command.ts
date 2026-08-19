import {
    SlashCommandBuilder,
    MessageFlags,
    type ChatInputCommandInteraction,
    type GuildMember,
    type Message,
    type MessageComponentInteraction,
    type ActionRowBuilder,
    type ButtonBuilder,
    type StringSelectMenuBuilder,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { HELP } from "@constants";
import {
    buildOverviewEmbed,
    buildCategoryEmbed,
    buildCategoryRow,
    buildPagerRow,
    groupByCategory,
    sortedCategories,
    pageCount,
} from "@bot/utils/help/build-help";
import { buildHelpContext, type HelpContext } from "@bot/utils/help/help-context";
import { findHelpTarget, buildCommandHelpText } from "@bot/utils/help/command-help-text";

const COLLECTOR_IDLE_MS = 120_000;

/** Resolves a free-text category argument to a real category name (case-insensitive), or null. */
function resolveCategory(client: BotClient, context: HelpContext, input: string | null): string | null {
    if (!input) return null;
    const target = input.trim().toLowerCase();
    return sortedCategories(groupByCategory(client, context)).find(c => c.toLowerCase() === target) ?? null;
}

type Rows = (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[];

/**
 * `!help` / `/help`.
 *
 * Reads the live command collection rather than a maintained list, so a command appears the moment
 * it loads. What it shows is scoped to the reader and the server: admin-scoped commands are hidden
 * from anyone who cannot run them, since they are only registered to the admin guild, and commands
 * from a switched-off feature are listed but marked — hiding those would leave an admin no way to
 * find out what enabling the feature would bring.
 *
 * Three views, deliberately separated: an overview of categories, a paged list of one category, and
 * one command in full. They used to be two, with the category view carrying every subcommand of
 * every command in it — which pushed Configuration past Discord's 6000-character embed limit, so
 * the API rejected the render and selecting that category did nothing at all.
 */
export default {
    scope: "guild",
    access: "general",
    category: HELP.generalCategory,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("List every command, its usage and category")
        .addStringOption(opt =>
            opt.setName("query").setDescription("A category (e.g. moderation) or a command name (e.g. coins)").setRequired(false)
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const context = await buildHelpContext(
            client,
            interaction.guildId,
            interaction.user.id,
            (interaction.member as GuildMember | null) ?? null,
        );
        const query = interaction.options.getString("query");

        // A category wins over a command of the same name — categories are the coarser answer, and
        // no category currently shares a name with a command.
        const category = resolveCategory(client, context, query);
        const target = category || !query ? null : findHelpTarget(client, context, query);

        // A target the reader may not run is answered with silence in chat, and with the same
        // "no such command" a typo gets from a slash invocation, which must be acknowledged. Saying
        // "that exists but is not for you" is the one reply that tells a member something.
        if (target && !context.canRun(target.command)) {
            if (!(interaction as { isPrefix?: boolean }).isPrefix) {
                await interaction.reply({
                    content: HELP.unknownCommand(query!, context.prefix),
                    flags: MessageFlags.Ephemeral,
                });
            }
            return;
        }

        if (query && !category && !target) {
            await interaction.reply({
                content: HELP.unknownCommand(query, context.prefix),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        let view: string = category ?? HELP.overviewSelectValue;
        let page = 1;

        const render = (): { embeds: [ReturnType<typeof buildOverviewEmbed>]; components: Rows } => {
            const embed = view === HELP.overviewSelectValue
                ? buildOverviewEmbed(client, context)
                : buildCategoryEmbed(client, context, view, page);

            const rows: Rows = [buildCategoryRow(client, context, view)];
            const pager = view === HELP.overviewSelectValue ? null : buildPagerRow(client, context, view, page);
            if (pager) rows.push(pager);

            return { embeds: [embed], components: rows };
        };

        // A named command answers directly, in plain text. There is nothing to browse from there,
        // so it gets no menu — the reader asked a closed question.
        if (target) {
            await interaction.reply({ content: buildCommandHelpText(client, context, target) });
            return;
        }

        await interaction.reply(render());

        const message = (await interaction.fetchReply()) as Message | null;
        if (!message) return;

        const collector = message.createMessageComponentCollector({ idle: COLLECTOR_IDLE_MS });

        collector.on("collect", async (component: MessageComponentInteraction) => {
            // Only the person who opened the menu drives it — the context was resolved for them.
            if (component.user.id !== interaction.user.id) {
                await component.reply({ content: HELP.pickPrompt, flags: MessageFlags.Ephemeral }).catch(() => null);
                return;
            }

            if (component.isStringSelectMenu()) {
                view = component.values[0]!;
                page = 1;
            } else if (component.customId === HELP.nextCustomId) {
                page = Math.min(page + 1, pageCount(groupByCategory(client, context).get(view) ?? []));
            } else if (component.customId === HELP.prevCustomId) {
                page = Math.max(1, page - 1);
            } else {
                return;
            }

            await component.update(render()).catch(() => null);
        });

        collector.on("end", async () => {
            await message.edit({ components: [] }).catch(() => null);
        });
    },
};
