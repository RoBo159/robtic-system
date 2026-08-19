/**
 * Two guarantees about moderation, checked at build time rather than the next time someone types a
 * sentence in chat.
 *
 * 1. Every moderation command declares a bot-side permission gate. `setDefaultMemberPermissions`
 *    is not one: Discord applies it to the slash entry point only, so a command relying on it was
 *    wide open from `!chat clear` — checkPermissions ends in a permissive fallthrough for a command
 *    that declares neither `requiredPermission` nor `access: "admin"`.
 *
 * 2. A channel-utility shortcut only fires on arguments it can actually use. A one-letter trigger
 *    matches on a word boundary, so `l` claims every message starting "l ", and these utilities used
 *    to ignore their arguments entirely — which turned "l ike i said" into a channel lock.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Guild, GuildTextBasedChannel } from "discord.js";
import { parseChatUtilArgs, type ChatUtilKey } from "@bot/features/shortcuts/functions/parse-chat-util-args";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

// ---------------------------------------------------------------------------
// 1. Moderation commands declare a gate
// ---------------------------------------------------------------------------

const MOD_DIR = join(import.meta.dir, "..", "apps", "bot", "src", "commands", "guild", "admin", "moderation");

function walk(dir: string, suffix: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, suffix, found);
        else if (entry.endsWith(suffix)) found.push(full);
    }
    return found;
}

const GATE = /requiredPermission:|access:\s*["']admin["']|scope:\s*["']admin["']/;

console.log("Moderation command gates:\n");
for (const file of walk(MOD_DIR, ".command.ts")) {
    const source = readFileSync(file, "utf8");
    const name = file.slice(MOD_DIR.length + 1);
    check(`${name} declares a bot-side permission gate`, GATE.test(source));
}

// ---------------------------------------------------------------------------
// 2. Channel-utility shortcut arguments
// ---------------------------------------------------------------------------

const CHANNEL_ID = "123456789012345678";
const OTHER_ID = "876543210987654321";

const here = { id: CHANNEL_ID, isTextBased: () => true } as unknown as GuildTextBasedChannel;
const other = { id: OTHER_ID, isTextBased: () => true } as unknown as GuildTextBasedChannel;

const guild = {
    channels: {
        cache: new Map([[OTHER_ID, other], [CHANNEL_ID, here]]),
        fetch: async () => null,
    },
} as unknown as Guild;

type Case = [key: ChatUtilKey, args: string, expected: "run" | "ignore", note: string];

const cases: Case[] = [
    // The request, verbatim: a bare trigger acts, the same trigger inside a sentence does not.
    ["clear", "", "run", "`c` alone clears"],
    ["clear", "10", "run", "`c 10` clears ten"],
    ["clear", `<#${OTHER_ID}>`, "run", "`c #channel` clears elsewhere"],
    ["clear", `20 <#${OTHER_ID}>`, "run", "`c 20 #channel`"],
    ["clear", "and other message not number", "ignore", "`c and other message…` is chat"],
    ["clear", "0", "ignore", "clearing zero messages is not a request"],
    ["clear", "10 20", "ignore", "two counts is a typo, not an invocation"],

    ["lock", "", "run", "`l` alone locks"],
    ["lock", `<#${OTHER_ID}>`, "run", "`l #channel` locks that channel"],
    ["lock", "ike i do something", "ignore", "`l ike i do something` is chat"],
    ["lock", "down the gate", "ignore", "prose after the trigger is chat"],

    ["unlock", "", "run", "`ul` alone unlocks"],
    ["unlock", "please", "ignore", "prose after unlock is chat"],
    ["hide", "", "run", "`h` alone hides"],
    ["hide", "this from them", "ignore", "prose after hide is chat"],
    ["show", "", "run", "`s` alone shows"],
    ["show", "me the logs", "ignore", "prose after show is chat"],

    ["slowmode", "5s", "run", "`sm 5s`"],
    ["slowmode", "30", "run", "`sm 30` bare seconds"],
    ["slowmode", `1h <#${OTHER_ID}>`, "run", "`sm 1h #channel`"],
    ["slowmode", "", "ignore", "bare slowmode would silently clear it"],
    ["slowmode", "everyone down", "ignore", "`sm everyone down` is chat"],
    ["slowmode", "5s 10m", "ignore", "two durations is a typo"],

    ["lock", "<#999>", "ignore", "an unresolvable channel is not a target"],
];

console.log("\nChannel-utility shortcut arguments:\n");
for (const [key, args, expected, note] of cases) {
    const parsed = await parseChatUtilArgs(key, args, here, guild);
    const actual = parsed ? "run" : "ignore";
    check(note, actual === expected, `${key}${args ? ` "${args}"` : " (no args)"} → ${actual}`);
}

// Argument shapes land where the command reads them.
const cleared = await parseChatUtilArgs("clear", `20 <#${OTHER_ID}>`, here, guild);
check("clear reads its count and target", cleared?.amount === 20 && cleared?.channel.id === OTHER_ID);

const slowed = await parseChatUtilArgs("slowmode", `<#${OTHER_ID}> 10m`, here, guild);
check("argument order does not matter", slowed?.duration === "10m" && slowed?.channel.id === OTHER_ID);

const local = await parseChatUtilArgs("lock", "", here, guild);
check("no channel named means the current one", local?.channel.id === CHANNEL_ID);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
