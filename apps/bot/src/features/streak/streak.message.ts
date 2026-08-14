import type { MessageCommandConfig } from "@typings/message-command";
import { replyTransientNotice, subcommandUsage } from "@bot/utils/prefix";
import { streakFeature } from "./streak";

/**
 * Only the two commands that require a subcommand get a usage line. `!streak` and `!streak-top` are
 * complete invocations on their own, so they have nothing to print and no entry here.
 */
const WITH_SUBCOMMANDS = ["streak-reward", "streak-config"] as const;

export default WITH_SUBCOMMANDS.map(name => {
    const command = streakFeature.commands.find(entry => entry.name === name)!;

    return {
        name,
        feature: "streak",
        async run({ message, prefix, argString }) {
            if (argString.trim()) return false;

            await replyTransientNotice(message, subcommandUsage(prefix, command));
            return true;
        },
    } satisfies MessageCommandConfig;
});
