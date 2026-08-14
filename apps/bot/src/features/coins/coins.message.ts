import type { MessageCommandConfig } from "@typings/message-command";
import { replyTransientNotice, subcommandUsage } from "@bot/utils/prefix";
import { coinsFeature } from "./coins";

/**
 * Answers a bare `!coins` with its subcommand list.
 *
 * Returning false for anything else hands the message straight to the normal prefix pipeline, so
 * `!coins balance @user` still parses against the real option schema. Without this, a bare `!coins`
 * would hit the parser's generic "missing subcommand" error, which names the problem but not the
 * options — the one thing someone typing the command blind actually needs.
 */
export default {
    name: "coins",
    feature: "coins",
    async run({ message, prefix, argString }) {
        if (argString.trim()) return false;

        await replyTransientNotice(message, subcommandUsage(prefix, coinsFeature.commands[0]));
        return true;
    },
} satisfies MessageCommandConfig;
