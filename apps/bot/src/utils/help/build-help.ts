import {
    EmbedBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    type APIEmbedField,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import { COLORS, HELP, HELP_CATEGORY_EMOJI } from "@constants";
import { BRANCH_CONFIG } from "@config";
import { commandUsageEntries, isChatInputCommand } from "./command-usage";

const emojiFor = (category: string): string => HELP_CATEGORY_EMOJI[category] ?? "📁";

/** The bot's own Discord username, which is what a reader recognises — the internal BotName is just "main". */
function displayName(client: BotClient): string {
    return client.user?.username ?? BRANCH_CONFIG.server.name;
}

/** Groups the bot's chat-input commands by their `category` (uncategorized → "General"). */
export function groupByCategory(client: BotClient): Map<string, CommandConfig[]> {
    const groups = new Map<string, CommandConfig[]>();
    for (const command of client.commands.values()) {
        if (!isChatInputCommand(command)) continue;
        const category = command.category ?? HELP.generalCategory;
        const bucket = groups.get(category) ?? [];
        bucket.push(command);
        groups.set(category, bucket);
    }
    return groups;
}

/** Category names sorted alphabetically, with "General" pinned first. */
export function sortedCategories(groups: Map<string, CommandConfig[]>): string[] {
    return [...groups.keys()].sort((a, b) => {
        if (a === HELP.generalCategory) return -1;
        if (b === HELP.generalCategory) return 1;
        return a.localeCompare(b);
    });
}

function commandName(command: CommandConfig): string {
    return (command.data as any).name as string;
}

/** One embed field per command in a category: name header + its usage lines. */
function categoryFields(commands: CommandConfig[], prefix: string): APIEmbedField[] {
    return [...commands]
        .sort((a, b) => commandName(a).localeCompare(commandName(b)))
        .map(command => {
            const entries = commandUsageEntries(prefix, command);
            const lines = entries.map(e => (e.description ? `${e.usage} — ${e.description}` : e.usage));
            if (command.modalOnly) lines.push(HELP.slashOnlyNote(prefix, commandName(command)));
            return {
                name: commandName(command),
                value: lines.join("\n").slice(0, 1024) || "​",
            };
        });
}

function totalCommands(groups: Map<string, CommandConfig[]>): number {
    let count = 0;
    for (const bucket of groups.values()) count += bucket.length;
    return count;
}

/** Landing view: intro + category list, with the "General" commands shown inline if any exist. */
export function buildOverviewEmbed(client: BotClient, prefix: string): EmbedBuilder {
    const groups = groupByCategory(client);
    const categories = sortedCategories(groups);
    const botName = displayName(client);

    const embed = new EmbedBuilder()
        .setTitle(HELP.title(botName))
        .setColor(COLORS.info)
        .setFooter({ text: HELP.footer(totalCommands(groups)) });

    const descParts = [HELP.intro(prefix)];
    if (categories.length > 0) {
        descParts.push(HELP.categoriesLine(categories.map(c => `${emojiFor(c)} ${c}`)));
    }
    descParts.push(HELP.pickPrompt);
    embed.setDescription(descParts.join("\n\n"));

    const general = groups.get(HELP.generalCategory);
    if (general && general.length > 0) {
        embed.addFields(...categoryFields(general, prefix).slice(0, 25));
    }

    return embed;
}

/** Detail view for one category: every command in it, with usage. */
export function buildCategoryEmbed(client: BotClient, prefix: string, category: string): EmbedBuilder {
    const groups = groupByCategory(client);
    const botName = displayName(client);
    const commands = groups.get(category) ?? [];

    const embed = new EmbedBuilder()
        .setTitle(HELP.categoryTitle(botName, `${emojiFor(category)} ${category}`))
        .setColor(COLORS.info)
        .setFooter({ text: HELP.footer(commands.length) });

    if (commands.length === 0) {
        embed.setDescription(HELP.emptyCategory);
        return embed;
    }

    embed.addFields(...categoryFields(commands, prefix).slice(0, 25));
    return embed;
}

/** Category dropdown; `selected` marks the active category (or overview) so it stays highlighted. */
export function buildCategoryRow(client: BotClient, selected?: string): ActionRowBuilder<StringSelectMenuBuilder> {
    const groups = groupByCategory(client);
    const categories = sortedCategories(groups);

    const menu = new StringSelectMenuBuilder()
        .setCustomId(HELP.selectCustomId)
        .setPlaceholder(HELP.selectPlaceholder)
        .addOptions(
            {
                label: HELP.overviewSelectLabel,
                value: HELP.overviewSelectValue,
                default: selected === HELP.overviewSelectValue || selected === undefined,
            },
            ...categories.slice(0, 24).map(category => ({
                label: category,
                value: category,
                emoji: emojiFor(category),
                default: selected === category,
            })),
        );

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/** True when a bot has at least one browsable chat-input command. */
export function hasAnyCommands(client: BotClient): boolean {
    return totalCommands(groupByCategory(client)) > 0;
}
