import type { BotClient } from "@core/bot-client";
import type { MessageCommandConfig } from "@typings/message-command";
import type { LoadReport } from "./load-report";

function isMessageCommand(value: unknown): value is MessageCommandConfig {
    const candidate = value as MessageCommandConfig | undefined;
    return typeof candidate?.name === "string" && typeof candidate?.run === "function";
}

/**
 * Registers a `*.message.ts` default export under its name and every alias.
 *
 * These live in their own collection rather than in `client.commands`, because a prefix-only
 * handler has no `data` and no interaction `run` — folding it in would corrupt slash registration,
 * the help builder's category grouping, and the command count in `/system status`.
 */
export function registerMessageModule(client: BotClient, exported: unknown, path: string, report: LoadReport): void {
    const entries = Array.isArray(exported) ? exported : [exported];

    for (const entry of entries) {
        if (!isMessageCommand(entry)) {
            report.invalid.push({ path, reason: "default export is not a MessageCommandConfig (needs `name` and `run`)" });
            continue;
        }

        for (const name of [entry.name, ...(entry.aliases ?? [])]) {
            const key = name.toLowerCase();
            const existing = report.messageSources.get(key);

            if (existing) {
                report.collisions.push({ kind: "message", name: key, kept: existing, ignored: path });
                continue;
            }

            client.messageCommands.set(key, entry);
            report.messageSources.set(key, path);
        }

        report.messages++;
    }
}
