import { DiscordAPIError } from "discord.js";

export type ErrorCategory = "interaction_expired" | "discord_api" | "database" | "unknown";

export interface ClassifiedError {
    category: ErrorCategory;
    label: string;
    detail: string;
    /** Empty for interaction_expired — there's no live interaction left to reply to. */
    userMessage: string;
}

const EXPIRED_INTERACTION_CODES = new Set([10062, 40060]);

const DATABASE_ERROR_NAME_PATTERN = /^Mongo|^(Validation|Cast|Version|DocumentNotFound|StrictMode|ParallelSave|OverwriteModel)Error$/;

export function classifyError(err: unknown): ClassifiedError {
    if (err instanceof DiscordAPIError) {
        const code = typeof err.code === "number" ? err.code : -1;

        if (EXPIRED_INTERACTION_CODES.has(code)) {
            return {
                category: "interaction_expired",
                label: "INTERACTION EXPIRED",
                detail: `Discord error ${code}: ${err.message} — the interaction token died before the bot could respond (usually DB/network latency eating into Discord's ~3s ack window)`,
                userMessage: "",
            };
        }

        return {
            category: "discord_api",
            label: "DISCORD API",
            detail: `Discord error ${code}: ${err.message}`,
            userMessage: "Discord rejected that action — please try again.",
        };
    }

    if (err instanceof Error && DATABASE_ERROR_NAME_PATTERN.test(err.name)) {
        return {
            category: "database",
            label: "DATABASE",
            detail: err.stack ?? `${err.name}: ${err.message}`,
            userMessage: "The database didn't respond in time — please try again in a moment.",
        };
    }

    if (err instanceof Error) {
        return {
            category: "unknown",
            label: "UNKNOWN",
            detail: err.stack ?? err.message,
            userMessage: "Something went wrong while running that command.",
        };
    }

    return {
        category: "unknown",
        label: "UNKNOWN",
        detail: String(err),
        userMessage: "Something went wrong while running that command.",
    };
}
