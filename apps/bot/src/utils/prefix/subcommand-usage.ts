import type { FeatureCommand } from "@typings/feature";

/**
 * The one-line usage a bare `!coins` should answer with: `` `!coins [add|balance|rates|remove]` ``.
 *
 * The prefix parser's own error for a missing subcommand names the problem but not the options,
 * which is exactly what someone typing the command blind needs. Groups are listed alongside plain
 * subcommands because both are valid next words.
 */
export function subcommandUsage(prefix: string, command: FeatureCommand): string {
    const names = [
        ...(command.groups ?? []).map(group => group.name),
        ...(command.subcommands ?? []).map(sub => sub.name),
    ].sort();

    if (!names.length) return `\`${prefix}${command.name}\``;

    return `\`${prefix}${command.name} [${names.join("|")}]\``;
}
