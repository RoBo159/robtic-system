/**
 * Verifies that every command is actually usable the way a member reaches it from chat — by prefix
 * (`!warn add @user spam`) and through a `/shortcut` trigger, both of which run the same
 * duck-typed stand-in for a real interaction.
 *
 * The stand-in cannot do everything a gateway interaction can. A command that calls `showModal()`
 * on it crashes at the call rather than at load, so nothing catches it until someone types the
 * command — which is exactly how `!reason create` stayed broken.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ApplicationCommandOptionType } from "discord.js";
import { commandPaths, splitCommandPath } from "@bot/utils/prefix/command-paths";
import { splitFirstWord } from "@bot/utils/prefix/split-first-word";
import type { CommandConfig } from "@typings/command";
import type { CommandJSON, OptionJSON } from "@typings/prefix";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

const ROOT = join(import.meta.dir, "..", "apps", "bot", "src");

function walk(dir: string, suffix: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, suffix, found);
        else if (entry.endsWith(suffix)) found.push(full);
    }
    return found;
}

const commandFiles = walk(ROOT, ".command.ts");
console.log(`${commandFiles.length} command file(s)\n`);

interface Loaded {
    file: string;
    source: string;
    config: CommandConfig;
    json: CommandJSON;
}

const loaded: Loaded[] = [];

for (const file of commandFiles) {
    const mod = await import(file);
    const entries: CommandConfig[] = Array.isArray(mod.default) ? mod.default : [mod.default];
    const source = readFileSync(file, "utf8");

    for (const config of entries) {
        if (!config?.data || typeof (config.data as { toJSON?: unknown }).toJSON !== "function") continue;
        loaded.push({ file, source, config, json: (config.data as { toJSON: () => CommandJSON }).toJSON() });
    }
}

// 1. Modals. A prefix invocation has no modal to open, so every showModal() must sit behind one of
//    three things: a context-menu-only command (unreachable by prefix), a whole-command
//    `modalOnly`, a per-subcommand `modalOnlySubcommands`, or an explicit `isPrefix` fallback.
const unguarded: string[] = [];

for (const { file, source, config, json } of loaded) {
    if (!source.includes("showModal")) continue;

    const isContextMenu = json.type !== undefined && json.type !== 1;
    const guarded =
        isContextMenu ||
        config.modalOnly === true ||
        (config.modalOnlySubcommands?.length ?? 0) > 0 ||
        source.includes("isPrefix");

    if (!guarded) unguarded.push(`${json.name} (${file.split(/[\\/]/).slice(-1)[0]})`);
}

check("every showModal() is unreachable or guarded from the prefix path", unguarded.length === 0, unguarded.join(", "));

// 2. Declared modal subcommands must be real subcommands, or the guard protects nothing.
for (const { config, json } of loaded) {
    if (!config.modalOnlySubcommands?.length) continue;

    const real = commandPaths(json).map(path => splitCommandPath(path).subPath);
    const bogus = config.modalOnlySubcommands.filter(sub => !real.includes(sub));
    check(`${json.name}: modalOnlySubcommands name real subcommands`, bogus.length === 0, bogus.join(", "));
}

// 3. Option types the prefix parser cannot resolve. resolve-option-value.ts handles string,
//    integer, number, boolean, user, role and channel — a mentionable or attachment option would
//    make the whole command unreachable from chat.
const UNRESOLVABLE = new Set<number>([
    ApplicationCommandOptionType.Mentionable,
    ApplicationCommandOptionType.Attachment,
]);

const leafOptions = (json: CommandJSON): { path: string; options: OptionJSON[] }[] => {
    const out: { path: string; options: OptionJSON[] }[] = [];
    const options = json.options ?? [];
    const isSub = (o: OptionJSON) => o.type === ApplicationCommandOptionType.Subcommand;
    const isGroup = (o: OptionJSON) => o.type === ApplicationCommandOptionType.SubcommandGroup;

    if (!options.some(o => isSub(o) || isGroup(o))) return [{ path: json.name, options }];

    for (const option of options) {
        if (isSub(option)) out.push({ path: `${json.name} ${option.name}`, options: option.options ?? [] });
        else if (isGroup(option)) {
            for (const sub of option.options ?? []) {
                if (isSub(sub)) out.push({ path: `${json.name} ${option.name} ${sub.name}`, options: sub.options ?? [] });
            }
        }
    }
    return out;
};

const unreachable: string[] = [];
for (const { json } of loaded) {
    for (const leaf of leafOptions(json)) {
        for (const option of leaf.options) {
            if (UNRESOLVABLE.has(option.type)) unreachable.push(`${leaf.path}:${option.name}`);
        }
    }
}
check("no command needs an option type the prefix parser cannot resolve", unreachable.length === 0, unreachable.join(", "));

// 4. A required option after an optional one can never be supplied positionally — the parser reads
//    tokens in declaration order, so the optional one silently swallows the required one's value.
const badOrder: string[] = [];
for (const { json } of loaded) {
    for (const leaf of leafOptions(json)) {
        let seenOptional = "";
        for (const option of leaf.options) {
            if (!option.required) seenOptional = option.name;
            else if (seenOptional) badOrder.push(`${leaf.path}: "${option.name}" required after optional "${seenOptional}"`);
        }
    }
}
check("no required option sits after an optional one", badOrder.length === 0, badOrder.join(" · "));

// 5. Quoted tokens, so an option whose value contains a space can be typed at all.
const quoteCases: [string, string, string][] = [
    ['"coins balance" c', "coins balance", "c"],
    ["'warn add' red", "warn add", "red"],
    ["“coins balance” c", "coins balance", "c"],
    ["coins balance", "coins", "balance"],
    ["it's fine here", "it's", "fine here"],
    ['"unterminated c', '"unterminated', "c"],
    ["", "", ""],
];

for (const [input, head, tail] of quoteCases) {
    const [got, rest] = splitFirstWord(input);
    check(`splitFirstWord(${JSON.stringify(input)})`, got === head && rest === tail, `→ ${JSON.stringify(got)} + ${JSON.stringify(rest)}`);
}

// 6. Moderation, named explicitly — it is the set that gets driven from chat most.
const moderation = loaded.filter(entry => entry.config.category === "Moderation");
console.log(`\nModeration commands (${moderation.length}):`);
for (const { config, json } of moderation.sort((a, b) => a.json.name.localeCompare(b.json.name))) {
    const isContextMenu = json.type !== undefined && json.type !== 1;
    const paths = isContextMenu ? ["—"] : commandPaths(json);
    const note = isContextMenu
        ? "context menu, not reachable by prefix"
        : config.modalOnly
            ? "slash only (modal)"
            : config.modalOnlySubcommands?.length
                ? `prefix ok except: ${config.modalOnlySubcommands.join(", ")}`
                : "prefix ok";
    console.log(`  ${json.name.padEnd(16)} ${note.padEnd(34)} ${paths.join(" · ")}`);
}

// 7. The shortcut target the request named: `?coins balance` behind a one-letter trigger.
const coins = loaded.find(entry => entry.json.name === "coins");
check("coins command is loaded", Boolean(coins));
if (coins) {
    const paths = commandPaths(coins.json);
    check("`coins balance` is a valid shortcut target", paths.includes("coins balance"), paths.join(" · "));

    const { name, subPath } = splitCommandPath("coins balance");
    check("shortcut splits into command + subcommand", name === "coins" && subPath === "balance", `${name} / ${subPath}`);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
