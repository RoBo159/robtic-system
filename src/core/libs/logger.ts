import chalk from "chalk";
import fs from "fs";
import path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");

if (!fs.existsSync(LOGS_DIR)) {
    try {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    } catch (error) {
        console.error("Failed to create logs directory:", error);
    }
}

const timestamp = () => new Date().toISOString();
const dateStamp = () => new Date().toISOString().split("T")[0];

function writeLog(type: string, content: string) {
    const filePath = path.join(LOGS_DIR, `${type}.${dateStamp()}.log`);
    fs.appendFile(filePath, content + "\n", (err) => {
        if (err) console.error(`Failed to write to ${type} log file:`, err);
    });
}

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
        const formattedMsg = format(msg);
        console.log(`${chalk.gray(timestamp())} ${chalk.blue("[INFO]")} ${prefix} ${formattedMsg}`);
        writeLog("info", `[${timestamp()}] [INFO] ${prefix} ${formattedMsg}`);
    },

    success: (msg: unknown, context?: string) => {
        const prefix = context ? `[${context}]` : "";
        const formattedMsg = format(msg);
        console.log(`${chalk.gray(timestamp())} ${chalk.green("[SUCCESS]")} ${prefix} ${formattedMsg}`);
        writeLog("success", `[${timestamp()}] [SUCCESS] ${prefix} ${formattedMsg}`);
    },

    warn: (msg: unknown, context?: string) => {
        const prefix = context ? `[${context}]` : "";
        const formattedMsg = format(msg);
        console.warn(`${chalk.gray(timestamp())} ${chalk.yellow("[WARN]")} ${prefix} ${formattedMsg}`);
        writeLog("warn", `[${timestamp()}] [WARN] ${prefix} ${formattedMsg}`);
    },

    error: (msg: unknown, context?: string) => {
        const prefix = context ? `[${context}]` : "";
        const formattedMsg = format(msg);
        console.error(`${chalk.gray(timestamp())} ${chalk.red("[ERROR]")} ${prefix} ${formattedMsg}`);
        writeLog("error", `[${timestamp()}] [ERROR] ${prefix} ${formattedMsg}`);
    },

    debug: (msg: unknown, context?: string) => {
        if (process.env.NODE_ENV === "development") {
            const prefix = context ? `[${context}]` : "";
            console.log(`${chalk.gray(timestamp())} ${chalk.magenta("[DEBUG]")} ${prefix} ${format(msg)}`);
        }
    },

    bot: (botName: string, msg: unknown) => {
        const formattedMsg = format(msg);
        console.log(`${chalk.gray(timestamp())} ${chalk.cyan(`[${botName.toUpperCase()}]`)} ${formattedMsg}`);
        writeLog("bot", `[${timestamp()}] [${botName.toUpperCase()}] ${formattedMsg}`);
    },
};
