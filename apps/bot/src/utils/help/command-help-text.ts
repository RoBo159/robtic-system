import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import { HELP, CHAT_UTIL_EXAMPLES, type ChatUtilName } from "@constants";
import { commandUsageEntries } from "./command-usage";
import { commandName } from "./build-help";
import { isFromDisabledFeature, type HelpContext } from "./help-context";

/**
 * What `help <query>` can be about.
 *
 * A channel utility is its own kind because it is not a command: `clear` and `lock` run straight
 * from a message and exist only behind a shortcut, so there is no CommandConfig to describe them.
 * They are documented against `/chat`, which is the same code reached the other way.
 */
export type HelpTarget =
    | {
        kind: "command";
        command: CommandConfig;
        /**
         * The path asked about: `warn` for the whole command, `warn add` when the reader named a
         * trigger that runs only that form. Answering `?help red` with all three warn subcommands
         * buries the one they asked about.
         */
        path: string;
    }
    | { kind: "chatUtil"; name: ChatUtilName; command: CommandConfig };

const CHAT_COMMAND = "chat";

/** Strips a leading `/`, `!` or `?` so `?help ?clear` works as well as `?help clear`. */
const normalize = (input: string): string => input.trim().toLowerCase().replace(/^[/!?]/, "").replace(/\s+/g, " ");

const isChatUtil = (path: string): path is ChatUtilName =>
    Object.prototype.hasOwnProperty.call(CHAT_UTIL_EXAMPLES, path);

/**
 * Resolves what the reader asked about, ignoring whether they may see it.
 *
 * Visibility is the caller's decision because the two answers differ: a command that does not exist
 * earns "no such command", while one the reader may not run earns silence — telling them it exists
 * but is off limits is the one reply that leaks something.
 */
export function findHelpTarget(client: BotClient, context: HelpContext, input: string): HelpTarget | null {
    const wanted = normalize(input);
    if (!wanted) return null;

    for (const [path, triggers] of context.shortcutsByTarget) {
        if (triggers.some(trigger => trigger.toLowerCase() === wanted)) return resolvePath(client, path);
    }

    return resolvePath(client, wanted);
}

/** `clear` → the channel utility; `warn add` → that one form; `warn` → the whole command. */
function resolvePath(client: BotClient, path: string): HelpTarget | null {
    const chat = client.commands.get(CHAT_COMMAND);
    if (chat && isChatUtil(path)) return { kind: "chatUtil", name: path, command: chat };

    const first = path.split(" ")[0] ?? "";
    const command = client.commands.get(first);
    return command ? { kind: "command", command, path } : null;
}

/** The path a shortcut would store for this target — how triggers are matched back to it. */
const targetPath = (target: HelpTarget): string =>
    target.kind === "chatUtil" ? target.name : target.path;

/**
 * One command in full, as plain text.
 *
 * Text rather than an embed because this is a reference someone reads and retypes — usage lines in
 * an embed field wrap awkwardly on mobile and cannot be copied cleanly, and the surrounding title,
 * colour and footer carry nothing the reader asked for.
 */
export function buildCommandHelpText(client: BotClient, context: HelpContext, target: HelpTarget): string {
    const { prefix } = context;
    const { command } = target;

    const path = targetPath(target);
    const invocation = target.kind === "chatUtil" ? `${prefix}${CHAT_COMMAND} ${target.name}` : `${prefix}${path}`;

    const lines = [
        HELP.textCommandLine(invocation),
        HELP.textShortcutLine(shortcutSummary(context, path, prefix)),
    ];

    if (isFromDisabledFeature(command, context)) lines.push(HELP.disabledNote);
    if (command.modalOnly) lines.push(HELP.slashOnlyNote(prefix, commandName(command)));

    lines.push("", HELP.textUsageHeading);
    for (const usage of usageForms(context, target)) lines.push(`- ${usage}`);

    return lines.join("\n").slice(0, HELP.textLimit);
}

/**
 * Every trigger that reaches this target, including ones bound to a subcommand of it.
 *
 * `?help warn` has to mention `red` even though the trigger is stored against `warn add`, or the
 * answer claims the command has no shortcuts while the reader watches colleagues use one. Those get
 * their destination spelled out, since `red` and `?warn` are not interchangeable.
 */
function shortcutSummary(context: HelpContext, path: string, prefix: string): string {
    const parts: string[] = [];

    for (const [target, triggers] of context.shortcutsByTarget) {
        const exact = target === path;
        if (!exact && !target.startsWith(`${path} `)) continue;

        for (const trigger of triggers) {
            parts.push(exact ? `\`${trigger}\`` : `\`${trigger}\` → \`${prefix}${target}\``);
        }
    }

    return parts.length ? parts.join(", ") : HELP.noShortcuts;
}

/**
 * The invocable forms, most useful first.
 *
 * A channel utility gets concrete examples rather than `[amount] [channel]` placeholders, because
 * its arguments are matched by shape and seeing `c 10 #general` explains that far faster than a
 * grammar does. Everything else reuses the prefix router's own usage line, so what help prints is
 * exactly what the parser accepts.
 */
function usageForms(context: HelpContext, target: HelpTarget): string[] {
    if (target.kind === "chatUtil") return chatUtilForms(context, target.name);

    const entries = commandUsageEntries(context.prefix, target.command);
    const scoped = entries.filter(entry => entry.path === target.path);

    const shown = scoped.length ? scoped : entries;
    return shown.map(form => (form.description ? `${form.usage} — ${form.description}` : form.usage));
}

function chatUtilForms(context: HelpContext, name: ChatUtilName): string[] {
    const examples = CHAT_UTIL_EXAMPLES[name];

    const triggers = context.shortcutsByTarget.get(name) ?? [];
    const shortest = [...triggers].sort((a, b) => a.length - b.length)[0];

    const heads = [shortest, `${context.prefix}${CHAT_COMMAND} ${name}`].filter(Boolean) as string[];
    return heads.flatMap(head => examples.map(example => `\`${[head, example].filter(Boolean).join(" ")}\``));
}
