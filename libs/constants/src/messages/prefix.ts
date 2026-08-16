/** Replies produced by the prefix-command router and argument parser. */
export const PREFIX_MESSAGES = {
    modalOnlyCommand: (commandName: string) => `\`${commandName}\` needs its form fields — use \`/${commandName}\` instead.`,
    modalOnlySubcommand: (commandName: string, subcommand: string) =>
        `\`${commandName} ${subcommand}\` needs its form fields — use \`/${commandName} ${subcommand}\` instead. ` +
        "The command's other subcommands still work from chat.",
    unknownSubcommand: (expectedNames: string) => `Missing/unknown subcommand. Expected one of: ${expectedNames}`,
    unknownSubcommandInGroup: (group: string, expectedNames: string) => `Missing/unknown subcommand in group "${group}". Expected one of: ${expectedNames}`,
    missingRequiredOption: (optionName: string, usage: string) => `Missing required option \`${optionName}\`. Usage: ${usage}`,
    invalidOptionValue: (optionName: string, token: string, usage: string) => `Couldn't understand \`${optionName}\`: \`${token}\`. Usage: ${usage}`,
    missingOption: (optionName: string) => `Missing option "${optionName}"`,
    noSubcommand: "No subcommand specified",
    noSubcommandGroup: "No subcommand group specified",
} as const;

/** How long a prefix usage/validation notice (and the mistyped trigger message) stays before auto-deletion. */
export const PREFIX_USAGE_DELETE_MS = 5_000;
