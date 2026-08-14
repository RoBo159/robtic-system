import type { ClientEvents } from "discord.js";
import type { BotClient } from "@core/bot-client";

/**
 * A gateway listener module. The loader appends the BotClient as the final argument, which is why
 * `execute` takes the discord.js payload followed by the client.
 *
 * Existing event files are untyped object literals and remain structurally compatible; new ones
 * should write `satisfies EventConfig<"messageCreate">` so the payload type is actually checked.
 */
export interface EventConfig<K extends keyof ClientEvents = keyof ClientEvents> {
    name: K;
    /** Attach with `client.once` instead of `client.on`. */
    once?: boolean;
    execute: (...args: [...ClientEvents[K], BotClient]) => Promise<void> | void;
}
