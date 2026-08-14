import type { Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "./command";

export interface MessageCommandContext {
    message: Message;
    client: BotClient;
    /** The guild's configured prefix, e.g. "!". */
    prefix: string;
    /** Everything after the command word. Empty string for a bare `!coins`. */
    argString: string;
    /** The slash command this text form fronts, when one is loaded. */
    command: CommandConfig | undefined;
}

/**
 * A prefix-only handler that runs *in front of* the normal prefix pipeline.
 *
 * Returning `true` means the message is fully handled and the router stops. Returning `false` hands
 * it to `runPrefixShortcut` unchanged, so a `*.message.ts` only has to describe the cases the option
 * parser cannot — chiefly a bare `!coins`, which should print `!coins [add|balance|…]` rather than
 * the parser's raw "missing subcommand" error.
 */
export interface MessageCommandConfig {
    /** First word after the prefix, lowercase. */
    name: string;
    /** Extra first words routed to the same handler. */
    aliases?: readonly string[];
    /** Key of the feature that owns this handler. */
    feature?: string;
    run: (context: MessageCommandContext) => Promise<boolean>;
}
