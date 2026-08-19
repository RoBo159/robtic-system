import {
    EmbedBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import { COLORS, HELP, HELP_CATEGORY_EMOJI } from "@constants";
import { BRANCH_CONFIG } from "@config";
import { listFeatureManifests } from "@core/features";
import { commandUsageEntries } from "./command-usage";
import { visibleCommands, isFromDisabledFeature, type HelpContext } from "./help-context";

/**
 * Discord's real ceilings. The old builder respected neither: it emitted one field per command
 * carrying *every* usage line, then `.slice(0, 25)`. Configuration reached 6188 characters, over
 * the 6000 limit, so the API rejected the edit and the select handler's `.catch(() => null)`
 * swallowed it — picking that category simply did nothing, with no error anywhere.
 *
 * Everything below is budgeted instead of truncated: a category that does not fit becomes pages.
 */
const EMBED_CHAR_BUDGET = 5200; // 6000, minus room for title, footer and field names
const DESCRIPTION_LIMIT = 4096;
const COMMANDS_PER_PAGE = 12;

const emojiFor = (category: string): string => HELP_CATEGORY_EMOJI[category] ?? "📁";

/** The bot's own Discord username, which is what a reader recognises — the internal BotName is just "main". */
function displayName(client: BotClient): string {
    return client.user?.username ?? BRANCH_CONFIG.server.name;
}

export function commandName(command: CommandConfig): string {
    return (command.data as { name: string }).name;
}

function commandDescription(command: CommandConfig): string {
    return (command.data as { toJSON: () => { description?: string } }).toJSON().description ?? "";
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

    for (const bucket of groups.values()) {
        bucket.sort((a, b) => commandName(a).localeCompare(commandName(b)));
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

export function pageCount(commands: CommandConfig[]): number {
    return Math.max(1, Math.ceil(commands.length / COMMANDS_PER_PAGE));
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

/**
 * Landing view: how to invoke commands, what categories exist and how big they are.
 *
 * No command list here any more. It used to dump every General command as its own field beneath an
 * intro, a category line and a feature line — four kinds of content competing on the first screen,
 * which is what made the menu feel like a wall rather than a starting point.
 */
export function buildOverviewEmbed(client: BotClient, context: HelpContext): EmbedBuilder {
    const groups = groupByCategory(client, context);
    const categories = sortedCategories(groups);

    const embed = new EmbedBuilder()
        .setTitle(HELP.title(displayName(client)))
        .setColor(COLORS.info)
        .setFooter({ text: HELP.footer(totalCommands(groups)) });

    const parts = [HELP.intro(context.prefix)];

    if (categories.length > 0) {
        parts.push(HELP.categoriesLine(
            categories.map(c => HELP.categoryCount(`${emojiFor(c)} ${c}`, groups.get(c)?.length ?? 0))
        ));
    }

    const features = featuresLine(context);
    if (features) {
        parts.push(features);
        if ([...context.featureState.values()].some(on => !on)) {
            parts.push(HELP.featuresHint(context.prefix));
        }
    }

    parts.push(`${HELP.pickPrompt}\n${HELP.detailHint(context.prefix)}`);
    embed.setDescription(parts.join("\n\n").slice(0, DESCRIPTION_LIMIT));

    return embed;
}

/**
 * One line per command: how to invoke it, what it does, and how many subcommands it has.
 *
 * The subcommands themselves are deliberately not listed. A category view answers "what can I do
 * here"; `help <command>` answers "how exactly do I run this one". Conflating them is what made
 * Configuration too large to render at all.
 */
function categoryLines(commands: CommandConfig[], context: HelpContext): string[] {
    return commands.map(command => {
        const name = commandName(command);
        const forms = commandUsageEntries(context.prefix, command);
        const off = isFromDisabledFeature(command, context);

        const notes = [
            forms.length > 1 ? HELP.subcommandCount(forms.length) : "",
            command.modalOnly ? "slash only" : "",
            off ? "feature off" : "",
        ].filter(Boolean);

        const summary = commandDescription(command);
        const suffix = notes.length ? ` *(${notes.join(", ")})*` : "";

        return `${off ? "⚪" : "•"} \`${context.prefix}${name}\` — ${summary}${suffix}`;
    });
}

/** Detail view for one category, paginated so it always fits. `page` is 1-based. */
export function buildCategoryEmbed(
    client: BotClient,
    context: HelpContext,
    category: string,
    page = 1,
): EmbedBuilder {
    const commands = groupByCategory(client, context).get(category) ?? [];
    const pages = pageCount(commands);
    const current = Math.min(Math.max(1, page), pages);
    const slice = commands.slice((current - 1) * COMMANDS_PER_PAGE, current * COMMANDS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setTitle(HELP.categoryTitle(displayName(client), `${emojiFor(category)} ${category}`))
        .setColor(COLORS.info)
        .setFooter({ text: HELP.pageFooter(current, pages, commands.length) });

    if (commands.length === 0) {
        embed.setDescription(HELP.emptyCategory);
        return embed;
    }

    // Budgeted rather than sliced: lines are added while they fit and the remainder is reported,
    // so a page can never be silently short.
    const lines: string[] = [];
    let used = 0;
    let dropped = 0;

    for (const line of categoryLines(slice, context)) {
        if (used + line.length + 1 > Math.min(DESCRIPTION_LIMIT, EMBED_CHAR_BUDGET)) {
            dropped++;
            continue;
        }
        lines.push(line);
        used += line.length + 1;
    }

    if (dropped > 0) lines.push(HELP.truncatedNote(dropped));
    lines.push("", HELP.detailHint(context.prefix));

    embed.setDescription(lines.join("\n").slice(0, DESCRIPTION_LIMIT));
    return embed;
}

/** Category dropdown; `selected` marks the active entry so it stays highlighted. */
export function buildCategoryRow(
    client: BotClient,
    context: HelpContext,
    selected?: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
    const groups = groupByCategory(client, context);
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
                description: `${groups.get(category)?.length ?? 0} commands`,
                value: category,
                emoji: emojiFor(category),
                default: selected === category,
            })),
        );

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/** Page buttons, or null when the category fits on one page. */
export function buildPagerRow(
    client: BotClient,
    context: HelpContext,
    category: string,
    page: number,
): ActionRowBuilder<ButtonBuilder> | null {
    const commands = groupByCategory(client, context).get(category) ?? [];
    const pages = pageCount(commands);
    if (pages < 2) return null;

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(HELP.prevCustomId)
            .setLabel(HELP.prevButton)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(HELP.nextCustomId)
            .setLabel(HELP.nextButton)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= pages),
    );
}
