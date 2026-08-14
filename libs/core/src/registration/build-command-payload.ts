import type { Collection } from "discord.js";
import type { CommandConfig } from "@typings/command";
import { Logger } from "@logger";

/**
 * The character budget Discord actually measures a command against.
 *
 * Its limit covers the combined length of every name, description and choice value in one command
 * — not the serialised JSON, which is roughly twice as long because of keys and punctuation.
 * Measuring the wrong thing here would mean warning at half the real ceiling and sending people
 * to split commands that are nowhere near it.
 */
function commandCharacterCount(node: unknown): number {
    if (Array.isArray(node)) {
        return node.reduce<number>((total, entry) => total + commandCharacterCount(entry), 0);
    }

    if (typeof node !== "object" || node === null) return 0;

    let total = 0;

    for (const [key, value] of Object.entries(node)) {
        if (typeof value === "string" && (key === "name" || key === "description" || key === "value")) {
            total += value.length;
        } else if (typeof value === "object" && value !== null) {
            total += commandCharacterCount(value);
        }
    }

    return total;
}

export interface CommandPayload {
    /** `global` and `guild` scope — published on the ordinary route. */
    main: object[];
    /** `admin` scope — published only to the configured admin guild. */
    admin: object[];
}

/**
 * Splits loaded commands into the two routes they publish to.
 *
 * A command whose builder throws is skipped with an error rather than aborting the batch, so one
 * malformed command cannot take every other command offline.
 */
export function buildCommandPayload(commands: Collection<string, CommandConfig>, botName: BotName): CommandPayload {
    const payload: CommandPayload = { main: [], admin: [] };

    for (const [name, command] of commands) {
        try {
            const json = command.data.toJSON();

            const size = commandCharacterCount(json);
            if (size > 6500) {
                Logger.warn(
                    `Command "${name}" uses ${size} of Discord's 8000-character budget. ` +
                    `Split a subcommand group out before it starts failing to register.`,
                    botName,
                );
            }

            if (command.scope === "admin") payload.admin.push(json);
            else payload.main.push(json);
        } catch (error) {
            Logger.error(
                `Command "${name}" is invalid and was skipped so the rest can still register: ${error}`,
                botName,
            );
        }
    }

    return payload;
}
