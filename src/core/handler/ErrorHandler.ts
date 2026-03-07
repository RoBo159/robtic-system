import { Logger } from "@core/Logger.ts";

export class BotError extends Error {
    constructor(
        message: string,
        public type: "COMMAND" | "EVENT" | "DATABASE" | "MODULE" | "SYSTEM" = "SYSTEM"
    ) {
        super(message);
        this.name = `[${type} ERROR]`;
    }
}

export function handleError(err: unknown, location = "Unknown"): void {
    if (err instanceof BotError) {
        Logger.error(`${err.name} (${location}): ${err.message}`);
    } else if (err instanceof Error) {
        Logger.error(`[Unhandled Error] (${location}): ${err.stack ?? err.message}`);
    } else {
        Logger.error(`[Unknown Error] (${location}): ${String(err)}`);
    }
}
