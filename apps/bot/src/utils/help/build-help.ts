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
import { listFeatureManifests } from "@core/features";
import { commandUsageEntries } from "./command-usage";
import { visibleCommands, isFromDisabledFeature, type HelpContext } from "./help-context";

const emojiFor = (category: string): string => HELP_CATEGORY_EMOJI[category] ?? "📁";

/** The bot's own Discord username, which is what a reader recognises — the internal BotName is just "main". */
function displayName(client: BotClient): string {
    return client.user?.username ?? BRANCH_CONFIG.server.name;
}

function commandName(command: CommandConfig): string {
    return (command.data as { name: string }).name;
}

/** Groups the commands this viewer can see by their `category` (uncategorized → "General"). */
export function groupByCategory(client: BotClient, context: HelpContext): Map<string, CommandConfig[]> {
    const groups = new Map<string, CommandConfig[]>();

    for (const command of visibleCommands(client, context)) {
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

/** One embed field per command: its name, then a usage line per invocable form. */
function categoryFields(commands: CommandConfig[], context: HelpContext): APIEmbedField[] {
    return [...commands]
        .sort((a, b) => commandName(a).localeCompare(commandName(b)))
        .map(command => {
            const lines = commandUsageEntries(context.prefix, command)
                .map(e => (e.description ? `${e.usage} — ${e.description}` : e.usage));

            if (command.modalOnly) lines.push(HELP.slashOnlyNote(context.prefix, commandName(command)));
            if (isFromDisabledFeature(command, context)) lines.push(HELP.disabledNote);

            const off = isFromDisabledFeature(command, context) ? "⚪ " : "";

            return {
                name: `${off}${commandName(command)}`,
                value: lines.join("\n").slice(0, 1024) || "​",
            };
        });
}

function totalCommands(groups: Map<string, CommandConfig[]>): number {
    let count = 0;
    for (const bucket of groups.values()) count += bucket.length;
    return count;
}

/** `🟢 coins • ⚪ streak • …` — which features are live in this guild. */
function featuresLine(context: HelpContext): string | null {
    const manifests = listFeatureManifests();
    if (!manifests.length || !context.guildId) return null;

    const parts = manifests.map(m =>
        context.featureState.get(m.key) ? HELP.featureOn(m.key) : HELP.featureOff(m.key)
    );

    return `${HELP.featuresHeading} ${parts.join(" • ")}`;
}

/** Landing view: how to invoke commands, which categories exist, and which features are on here. */
export function buildOverviewEmbed(client: BotClient, context: HelpContext): EmbedBuilder {
    const groups = groupByCategory(client, context);
    const categories = sortedCategories(groups);

    const embed = new EmbedBuilder()
        .setTitle(HELP.title(displayName(client)))
        .setColor(COLORS.info)
        .setFooter({ text: HELP.footer(totalCommands(groups)) });

    const parts = [HELP.intro(context.prefix)];

    if (categories.length > 0) {
        parts.push(HELP.categoriesLine(categories.map(c => `${emojiFor(c)} ${c}`)));
    }

    const features = featuresLine(context);
    if (features) {
        parts.push(features);
        if ([...context.featureState.values()].some(on => !on)) {
            parts.push(HELP.featuresHint(context.prefix));
        }
    }

    parts.push(HELP.pickPrompt);
    embed.setDescription(parts.join("\n\n"));

    const general = groups.get(HELP.generalCategory);
    if (general?.length) embed.addFields(...categoryFields(general, context).slice(0, 25));

    return embed;
}

/** Detail view for one category: every command in it, with usage. */
export function buildCategoryEmbed(client: BotClient, context: HelpContext, category: string): EmbedBuilder {
    const commands = groupByCategory(client, context).get(category) ?? [];

    const embed = new EmbedBuilder()
        .setTitle(HELP.categoryTitle(displayName(client), `${emojiFor(category)} ${category}`))
        .setColor(COLORS.info)
        .setFooter({ text: HELP.footer(commands.length) });

    if (commands.length === 0) {
        embed.setDescription(HELP.emptyCategory);
        return embed;
    }

    embed.addFields(...categoryFields(commands, context).slice(0, 25));
    return embed;
}

/** Category dropdown; `selected` marks the active entry so it stays highlighted. */
export function buildCategoryRow(client: BotClient, context: HelpContext, selected?: string): ActionRowBuilder<StringSelectMenuBuilder> {
    const categories = sortedCategories(groupByCategory(client, context));

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
