import { ApplicationCommandOptionType } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandJSON, OptionJSON } from "@typings/prefix";

const isSub = (o: OptionJSON) => o.type === ApplicationCommandOptionType.Subcommand;
const isGroup = (o: OptionJSON) => o.type === ApplicationCommandOptionType.SubcommandGroup;

/**
 * Every invocable path of a command: `warn`, or `warn add` / `streak-config channel add` when it
 * has subcommands.
 *
 * A shortcut used to store only the command name, which quietly made it useless for any command
 * built from subcommands — `warn` alone is not runnable, so a trigger mapped to it fed the first
 * argument to the parser as a subcommand name and failed. Storing the whole path fixes that, and
 * is also what lets one command carry several shortcuts (`red` → `warn add`, `unred` → `warn
 * appeal`).
 */
export function commandPaths(json: CommandJSON): string[] {
    const options = json.options ?? [];
    const paths: string[] = [];

    for (const option of options) {
        if (isSub(option)) {
            paths.push(`${json.name} ${option.name}`);
        } else if (isGroup(option)) {
            for (const sub of option.options ?? []) {
                if (isSub(sub)) paths.push(`${json.name} ${option.name} ${sub.name}`);
            }
        }
    }

    // No subcommands — the command itself is the only path.
    return paths.length ? paths : [json.name];
}

/** Every runnable path across every loaded chat-input command. */
export function allCommandPaths(client: BotClient): string[] {
    const paths: string[] = [];

    for (const command of client.commands.values()) {
        const data = command.data as { toJSON?: () => CommandJSON };
        if (typeof data.toJSON !== "function") continue;

        const json = data.toJSON();
        // Context-menu entries have no typed form, so they cannot back a shortcut.
        if (json.type !== undefined && json.type !== 1) continue;

        paths.push(...commandPaths(json));
    }

    return paths.sort();
}

/** Splits a stored shortcut target into the command name and the subcommand words after it. */
export function splitCommandPath(path: string): { name: string; subPath: string } {
    const [name = "", ...rest] = path.trim().split(/\s+/);
    return { name, subPath: rest.join(" ") };
}

/** True when `path` names a command, and a real subcommand of it when one is given. */
export function isValidCommandPath(client: BotClient, path: string): boolean {
    const { name } = splitCommandPath(path);
    const command = client.commands.get(name);
    if (!command) return false;

    const data = command.data as { toJSON?: () => CommandJSON };
    if (typeof data.toJSON !== "function") return false;

    return commandPaths(data.toJSON()).includes(path.trim().replace(/\s+/g, " "));
}
