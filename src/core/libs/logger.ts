import chalk from "chalk";

const timestamp = () => new Date().toISOString();

function format(msg: unknown) {
    if (typeof msg === "string") return msg;

    if (msg instanceof Error) return msg.stack || msg.message;

    try {
        return JSON.stringify(msg, null, 2);
    } catch {
        return String(msg);
    }
}

export const Logger = {
    info: (msg: unknown, context?: string) => {
        const prefix = context ? `[${context}]` : "";
        console.log(`${chalk.gray(timestamp())} ${chalk.blue("[INFO]")} ${prefix} ${format(msg)}`);
    },

    success: (msg: unknown, context?: string) => {
        const prefix = context ? `[${context}]` : "";
        console.log(`${chalk.gray(timestamp())} ${chalk.green("[SUCCESS]")} ${prefix} ${format(msg)}`);
    },

    warn: (msg: unknown, context?: string) => {
        const prefix = context ? `[${context}]` : "";
        console.warn(`${chalk.gray(timestamp())} ${chalk.yellow("[WARN]")} ${prefix} ${format(msg)}`);
    },

    error: (msg: unknown, context?: string) => {
        const prefix = context ? `[${context}]` : "";
        console.error(`${chalk.gray(timestamp())} ${chalk.red("[ERROR]")} ${prefix} ${format(msg)}`);
    },

    debug: (msg: unknown, context?: string) => {
        if (process.env.NODE_ENV === "development") {
            const prefix = context ? `[${context}]` : "";
            console.log(`${chalk.gray(timestamp())} ${chalk.magenta("[DEBUG]")} ${prefix} ${format(msg)}`);
        }
    },

    bot: (botName: string, msg: unknown) => {
        console.log(`${chalk.gray(timestamp())} ${chalk.cyan(`[${botName.toUpperCase()}]`)} ${format(msg)}`);
    },
};
