import { ApplicationCommandOptionType, type Message } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { BotClient } from "@core/bot-client";
import type { CommandJSON, OptionJSON, ParseResult } from "@typings/prefix";
import { PREFIX_MESSAGES } from "@constants";
import { splitFirstWord } from "./split-first-word";
import { usageLine } from "./usage-line";
import { resolveOptionValue } from "./resolve-option-value";
import { buildFakeInteraction } from "./build-fake-interaction";

/**
 * Parses a prefix command's raw argument string against its slash command's registered option
 * schema (`command.data.toJSON()`), then builds a duck-typed stand-in for `ChatInputCommandInteraction`
 * so the existing `command.run(interaction, client)` bodies work unmodified from either entry point.
 * `run`'s parameter type is already `any` in `CommandConfig`, so no interaction/discord.js typing
 * needs to be satisfied — only the runtime shape commands actually call.
 */
export async function buildPrefixInteraction(
    message: Message,
    client: BotClient,
    command: CommandConfig,
    argString: string,
    prefix: string
): Promise<ParseResult> {
    const json = (command.data as any).toJSON() as CommandJSON;
    let schema = json.options ?? [];
    let rest = argString;
    let subcommandGroup: string | null = null;
    let subcommand: string | null = null;

    // Top-level options can be a mix of bare subcommands and subcommand-group siblings
    // (e.g. streak-config has both `channel <sub>`/`reminder <sub>` groups AND flat
    // subcommands like `settings`/`return`/`sync`) — resolve whichever the first word matches.
    const isSubOrGroup = (o: OptionJSON) =>
        o.type === ApplicationCommandOptionType.Subcommand || o.type === ApplicationCommandOptionType.SubcommandGroup;

    if (schema.some(isSubOrGroup)) {
        const [word, tail] = splitFirstWord(rest);
        const matched = schema.find(o => isSubOrGroup(o) && o.name === word.toLowerCase());
        if (!matched) {
            const names = schema.filter(isSubOrGroup).map(o => o.name).join(", ");
            return { error: PREFIX_MESSAGES.unknownSubcommand(names) };
        }
        rest = tail;

        if (matched.type === ApplicationCommandOptionType.SubcommandGroup) {
            subcommandGroup = matched.name;
            const groupOptions = matched.options ?? [];
            const [word2, tail2] = splitFirstWord(rest);
            const sub = groupOptions.find(o => o.type === ApplicationCommandOptionType.Subcommand && o.name === word2.toLowerCase());
            if (!sub) {
                const names2 = groupOptions.filter(o => o.type === ApplicationCommandOptionType.Subcommand).map(o => o.name).join(", ");
                return { error: PREFIX_MESSAGES.unknownSubcommandInGroup(matched.name, names2) };
            }
            subcommand = sub.name;
            schema = sub.options ?? [];
            rest = tail2;
        } else {
            subcommand = matched.name;
            schema = matched.options ?? [];
        }
    }

    const leaf = schema;
    const values = new Map<string, unknown>();

    for (let i = 0; i < leaf.length; i++) {
        const opt = leaf[i];
        const isLastString = i === leaf.length - 1 && opt.type === ApplicationCommandOptionType.String;

        let token: string;
        if (isLastString) {
            token = rest.trim();
            rest = "";
        } else {
            const [word, tail] = splitFirstWord(rest);
            token = word;
            rest = tail;
        }

        if (!token) {
            if (opt.required) {
                return { error: PREFIX_MESSAGES.missingRequiredOption(opt.name, usageLine(prefix, json.name, subcommandGroup, subcommand, leaf)) };
            }
            values.set(opt.name, null);
            continue;
        }

        const resolved = await resolveOptionValue(message, opt, token);
        if (resolved === undefined) {
            return {
                error: PREFIX_MESSAGES.invalidOptionValue(opt.name, token, usageLine(prefix, json.name, subcommandGroup, subcommand, leaf)),
            };
        }
        values.set(opt.name, resolved);
    }

    return { interaction: buildFakeInteraction(message, client, json.name, subcommandGroup, subcommand, values) };
}
