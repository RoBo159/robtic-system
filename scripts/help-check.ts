/**
 * Renders every help view against the real command tree and asserts it fits inside Discord's
 * limits.
 *
 * The failure this guards against is silent: an oversized embed is rejected by the API, and the
 * select handler's `.catch(() => null)` swallows the rejection, so the menu just stops responding.
 * Configuration reached 6188 characters before the views were split and paged.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { EmbedBuilder } from "discord.js";
import type { CommandConfig } from "@typings/command";
import { HELP } from "@constants";
import { isChatInputCommand } from "@bot/utils/help/command-usage";
import {
    buildOverviewEmbed,
    buildCategoryEmbed,
    buildCommandEmbed,
    buildCategoryRow,
    buildPagerRow,
    groupByCategory,
    sortedCategories,
    findCommand,
    pageCount,
    commandName,
} from "@bot/utils/help/build-help";
import type { HelpContext } from "@bot/utils/help/help-context";

const EMBED_LIMIT = 6000;
const DESCRIPTION_LIMIT = 4096;
const FIELD_LIMIT = 25;
const FIELD_VALUE_LIMIT = 1024;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

const ROOT = join(import.meta.dir, "..", "apps", "bot", "src");
function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (entry.endsWith(".command.ts")) out.push(full);
    }
    return out;
}

const commands = new Map<string, CommandConfig>();
for (const file of walk(ROOT)) {
    const mod = await import(file);
    for (const config of (Array.isArray(mod.default) ? mod.default : [mod.default]) as CommandConfig[]) {
        if (!config?.data || typeof (config.data as { toJSON?: unknown }).toJSON !== "function") continue;
        if (!isChatInputCommand(config)) continue;
        commands.set((config.data as { name: string }).name, config);
    }
}

const client = { commands, user: { username: "Robtic" } } as never;
const context: HelpContext = { prefix: "!", guildId: "guild", isSuperUser: true, featureState: new Map() };

/** What Discord counts: title, description, footer, and every field name and value. */
function embedSize(embed: EmbedBuilder): { chars: number; fields: number; longestField: number; description: number } {
    const json = embed.toJSON();
    const fields = json.fields ?? [];
    const chars =
        (json.title?.length ?? 0) +
        (json.description?.length ?? 0) +
        (json.footer?.text.length ?? 0) +
        fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0);

    return {
        chars,
        fields: fields.length,
        longestField: fields.reduce((max, f) => Math.max(max, f.value.length), 0),
        description: json.description?.length ?? 0,
    };
}

const groups = groupByCategory(client, context);
const categories = sortedCategories(groups);
console.log(`${commands.size} commands across ${categories.length} categories\n`);

// 1. Overview.
const overview = embedSize(buildOverviewEmbed(client, context));
check("overview fits", overview.chars <= EMBED_LIMIT && overview.description <= DESCRIPTION_LIMIT, `${overview.chars} chars`);

// 2. Every category, every page.
console.log("\ncategory            cmds pages  worst page");
for (const category of categories) {
    const list = groups.get(category) ?? [];
    const pages = pageCount(list);
    let worst = 0;

    for (let page = 1; page <= pages; page++) {
        const size = embedSize(buildCategoryEmbed(client, context, category, page));
        worst = Math.max(worst, size.chars);

        check(
            `${category} page ${page} fits`,
            size.chars <= EMBED_LIMIT && size.description <= DESCRIPTION_LIMIT && size.fields <= FIELD_LIMIT,
            size.chars > EMBED_LIMIT ? `${size.chars} chars` : "",
        );
    }

    console.log(`  ${category.padEnd(18)} ${String(list.length).padStart(4)} ${String(pages).padStart(5)} ${String(worst).padStart(11)}`);
}

// 3. Pagination must not drop anyone: every command appears on some page of its category.
let missing = 0;
for (const category of categories) {
    const list = groups.get(category) ?? [];
    const rendered = Array.from({ length: pageCount(list) }, (_, i) =>
        buildCategoryEmbed(client, context, category, i + 1).toJSON().description ?? "").join("\n");

    for (const command of list) {
        if (!rendered.includes(`\`!${commandName(command)}\``)) {
            missing++;
            console.log(`      missing: ${category}/${commandName(command)}`);
        }
    }
}
check("every command appears on a page of its category", missing === 0, missing ? `${missing} missing` : "");

// 4. Out-of-range pages clamp rather than render empty.
const firstCategory = categories[0]!;
const clamped = buildCategoryEmbed(client, context, firstCategory, 99).toJSON();
check("an out-of-range page clamps to the last one", (clamped.description?.length ?? 0) > 0);

// 5. Command detail, including the command with the most subcommands.
const biggest = [...commands.values()].sort(
    (a, b) => ((b.data as { toJSON: () => { options?: unknown[] } }).toJSON().options?.length ?? 0)
        - ((a.data as { toJSON: () => { options?: unknown[] } }).toJSON().options?.length ?? 0)
)[0]!;

const oversized: string[] = [];
for (const command of commands.values()) {
    const size = embedSize(buildCommandEmbed(client, context, command));
    if (size.chars > EMBED_LIMIT || size.fields > FIELD_LIMIT || size.longestField > FIELD_VALUE_LIMIT) {
        oversized.push(`${commandName(command)} (${size.chars} chars, ${size.fields} fields, longest ${size.longestField})`);
    }
}
check("every command detail view fits", oversized.length === 0, oversized.join(", ") || `largest: ${commandName(biggest)}`);

// 6. Components.
const row = buildCategoryRow(client, context, HELP.overviewSelectValue).toJSON();
const menu = (row.components[0] as { options?: unknown[] }).options ?? [];
check("category menu stays within 25 options", menu.length <= 25, `${menu.length}`);

const pagedCategory = categories.find(c => pageCount(groups.get(c) ?? []) > 1);
check("a category large enough to page gets buttons", !pagedCategory || buildPagerRow(client, context, pagedCategory, 1) !== null,
    pagedCategory ?? "none needed");
check("a single-page category gets no buttons",
    categories.every(c => pageCount(groups.get(c) ?? []) > 1 || buildPagerRow(client, context, c, 1) === null));

// 7. Lookup.
check("findCommand resolves a bare name", findCommand(client, context, "coins") !== null);
check("findCommand tolerates a slash or prefix", findCommand(client, context, "/coins") !== null && findCommand(client, context, "!coins") !== null);
check("findCommand rejects nonsense", findCommand(client, context, "definitely-not-a-command") === null);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
