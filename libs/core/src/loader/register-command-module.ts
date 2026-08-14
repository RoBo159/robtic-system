import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import type { LoadReport } from "./load-report";

function isCommand(value: unknown): value is CommandConfig {
    const candidate = value as CommandConfig | undefined;
    return Boolean(candidate?.data && typeof candidate?.run === "function");
}

/**
 * Registers a `*.command.ts` default export, which may be one CommandConfig or an array of them —
 * a feature like streak owns six top-level commands and would otherwise need six near-identical
 * files whose only job is to re-export.
 *
 * On a duplicate name the first registration wins and the collision is reported rather than
 * silently overwritten. Combined with the deterministic scan order, that is what makes a feature
 * migration safe: the new `features/coins/coins.command.ts` beats the not-yet-deleted
 * `commands/coins.ts`, loudly, instead of the outcome depending on directory iteration order.
 */
export function registerCommandModule(client: BotClient, exported: unknown, path: string, report: LoadReport): void {
    const entries = Array.isArray(exported) ? exported : [exported];

    for (const entry of entries) {
        if (!isCommand(entry)) {
            report.invalid.push({ path, reason: "default export is not a CommandConfig (needs `data` and `run`)" });
            continue;
        }

        const name = entry.data.name;
        const existing = report.commandSources.get(name);

        if (existing) {
            report.collisions.push({ kind: "command", name, kept: existing, ignored: path });
            continue;
        }

        client.commands.set(name, entry);
        report.commandSources.set(name, path);
        report.commands++;
    }
}
