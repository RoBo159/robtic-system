import type { MessageCommandConfig } from "@typings/message-command";
import { replyTransientNotice, subcommandUsage } from "@bot/utils/prefix";
import { voiceFeature } from "./voice";

/** A bare `?voice` prints its subcommand list rather than the parser's generic error. */
export default {
    name: "voice",
    feature: "voice",
    async run({ message, prefix, argString }) {
        if (argString.trim()) return false;

        await replyTransientNotice(message, subcommandUsage(prefix, voiceFeature.commands[0]!));
        return true;
    },
} satisfies MessageCommandConfig;
