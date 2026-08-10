import { ApplicationCommandOptionType, ApplicationCommandType } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandJSON, OptionJSON } from "@typings/prefix";
import { usageLine } from "@bot/utils/prefix/usage-line";

export interface UsageEntry {
    /** Rendered `\`!name sub <opt>\`` usage string. */
    usage: string;
    /** The subcommand's description, or the command's own if it has no subcommands. */
    description: string;
}

const isSub = (o: OptionJSON) => o.type === ApplicationCommandOptionType.Subcommand;
const isGroup = (o: OptionJSON) => o.type === ApplicationCommandOptionType.SubcommandGroup;

/** True for real slash commands (skips context-menu entries, which have no typed prefix form). */
export function isChatInputCommand(command: CommandConfig): boolean {
    if (typeof (command.data as any).toJSON !== "function") return false;
    const json = (command.data as any).toJSON() as CommandJSON & { type?: number };
    return json.type === undefined || json.type === ApplicationCommandType.ChatInput;
}

/**
 * Expands a command into one usage line per invocable form: a line per subcommand (and per
 * group→subcommand), or a single line for a flat command. Reuses the prefix router's `usageLine`
 * so help usage matches exactly what the parser accepts.
 */
export function commandUsageEntries(prefix: string, command: CommandConfig): UsageEntry[] {
    const json = (command.data as any).toJSON() as CommandJSON;
    const options = json.options ?? [];
    const entries: UsageEntry[] = [];

    const hasSubs = options.some(o => isSub(o) || isGroup(o));
    if (!hasSubs) {
        return [{ usage: usageLine(prefix, json.name, null, null, options), description: json.description ?? "" }];
    }

    for (const opt of options) {
        if (isSub(opt)) {
            entries.push({
                usage: usageLine(prefix, json.name, null, opt.name, opt.options ?? []),
                description: opt.description ?? json.description ?? "",
            });
        } else if (isGroup(opt)) {
            for (const sub of opt.options ?? []) {
                if (!isSub(sub)) continue;
                entries.push({
                    usage: usageLine(prefix, json.name, opt.name, sub.name, sub.options ?? []),
                    description: sub.description ?? opt.description ?? json.description ?? "",
                });
            }
        }
    }

    return entries;
}
