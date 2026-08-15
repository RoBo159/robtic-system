import type { MessageCommandConfig } from "@typings/message-command";
import { replyTransientNotice, subcommandUsage } from "@bot/utils/prefix";
import { pointsFeature } from "./points";

/** A bare `?points` prints its subcommand list rather than the parser's generic error. */
export default {
    name: "points",
    feature: "points",
    async run({ message, prefix, argString }) {
        if (argString.trim()) return false;

        await replyTransientNotice(message, subcommandUsage(prefix, pointsFeature.commands[0]!));
        return true;
    },
} satisfies MessageCommandConfig;
