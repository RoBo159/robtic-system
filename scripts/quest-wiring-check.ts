/** Smoke-checks the quest feature's loadable surface without a gateway or a database. */
import commands, { questHandlers, configHandlers } from "@bot/features/quests/quests.command";
import componentIndex from "@bot/features/quests/quests.component";
import events from "@bot/features/quests/quests.event";
import { questsFeature } from "@bot/features/quests/quests";
import type { FeatureCommand } from "@typings/feature";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

// 1. Every manifest command has a runner and builds into valid Discord JSON.
const built = commands.map(c => c.data.toJSON());
check("both commands built", built.length === 2, built.map(b => b.name).join(", "));

for (const command of built) {
    check(`${command.name} name is valid`, /^[\w-]{1,32}$/.test(command.name));
    const description = "description" in command ? command.description : "";
    check(`${command.name} description length`, description.length > 0 && description.length <= 100);
}

// 2. Every leaf subcommand in the manifest must be routable.
const leaves: string[] = [];
for (const command of questsFeature.commands as readonly FeatureCommand[]) {
    for (const sub of command.subcommands ?? []) leaves.push(`${command.name} ${sub.name}`);
    for (const group of command.groups ?? []) {
        for (const sub of group.subcommands) leaves.push(`${command.name} ${group.name}:${sub.name}`);
    }
}
console.log(`      ${leaves.length} leaf subcommands declared`);

// 3. The built JSON must contain the same leaves — catches a manifest/builder mismatch.
const builtLeaves: string[] = [];
for (const command of built) {
    for (const option of command.options ?? []) {
        if (option.type === 1) builtLeaves.push(`${command.name} ${option.name}`);
        if (option.type === 2) {
            for (const sub of (option as { options?: { name: string }[] }).options ?? []) {
                builtLeaves.push(`${command.name} ${option.name}:${sub.name}`);
            }
        }
    }
}
check("built leaves match the manifest", builtLeaves.length === leaves.length, `${builtLeaves.length} vs ${leaves.length}`);
check("no leaf is missing", leaves.every(l => builtLeaves.includes(l)), leaves.filter(l => !builtLeaves.includes(l)).join(", "));

// 4. Every leaf must have a handler. A missing one only shows up as a hung interaction at runtime.
const unrouted = leaves.filter(leaf => {
    const [command, rest] = leaf.split(" ") as [string, string];
    return command === "quest" ? !questHandlers[rest!] : !configHandlers[rest!];
});
check("every leaf has a handler", unrouted.length === 0, unrouted.join(", "));

// And nothing routes to a leaf the manifest does not declare — a handler nobody can reach.
const declared = new Set(leaves);
const orphans = [
    ...Object.keys(questHandlers).map(key => `quest ${key}`),
    ...Object.keys(configHandlers).map(key => `quest-config ${key}`),
].filter(key => !declared.has(key));
check("no handler is unreachable", orphans.length === 0, orphans.join(", "));

// 5. Feature tagging, so the enable/disable gate actually applies.
check("commands carry the feature key", commands.every(c => c.feature === "quests"));
check("quest-config is admin-scoped", built.some(b => b.name === "quest-config") && commands.find(c => c.data.toJSON().name === "quest-config")?.access === "admin");
check("autocomplete is registered", typeof commands.find(c => c.data.toJSON().name === "quest-config")?.autocomplete === "function");

// 5. Components.
check("component index names the feature", componentIndex.feature === "quests");
check("component index has the claim handler", componentIndex.handlers.length === 1);
check("claim customId is a regex", componentIndex.handlers[0]!.customId instanceof RegExp);
check(
    "claim customId matches a real id",
    (componentIndex.handlers[0]!.customId as RegExp).test("quest:claim:65f1a2b3c4d5e6f7a8b9c0d1"),
);

// 6. Events, against what the manifest promises.
const names = events.map(e => e.name);
check("events match the manifest", questsFeature.events!.every(e => names.includes(e as never)), names.join(", "));
check("clientReady is once", events.find(e => e.name === "clientReady")?.once === true);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
