import type { Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import { PREFIX_MESSAGES, type ShortcutDeleteMode } from "@constants";
import { checkPermissions, checkFeatureEnabled, cooldowns, commandError, releaseCooldown } from "@bot/utils/interaction";
import { buildPrefixInteraction } from "./build-prefix-interaction";
import { replyTransientNotice } from "./reply-transient-notice";
import { scheduleShortcutCleanup } from "./shortcut-cleanup";

export interface PrefixInvocation {
    message: Message;
    client: BotClient;
    command: CommandConfig;
    commandName: string;
    argString: string;
    prefix: string;
    /**
     * Post-execution cleanup, configured per `/shortcut`. Plain `!command` passes nothing and
     * leaves both messages alone.
     */
    deleteMode?: ShortcutDeleteMode;
    /**
     * Refuse without saying anything — no usage line, no permission error, no feature notice.
     *
     * Set for a bare shortcut trigger, which is the one entry point that cannot tell a command from
     * ordinary chat: a trigger of `r` claims every message starting "r ", so "r ight, I'll check"
     * would otherwise answer with a usage line for `warn add` and delete what the member wrote.
     * `!warn` and `?r` both name a command outright and stay loud.
     */
    silent?: boolean;
}

/**
 * Shared by the prefix and custom-shortcut listeners — runs the same checkPermissions/cooldowns/run
 * pipeline a real slash invocation would use.
 *
 * Returns whether the command actually ran, so a caller keeping a use count only counts real
 * invocations: a bare trigger claims plain sentences too, and those refusals are not uses.
 */
export async function runPrefixShortcut(invocation: PrefixInvocation): Promise<boolean> {
    const { message, client, command, commandName, argString, prefix, deleteMode = "none", silent = false } = invocation;

    const notice = async (content: string): Promise<void> => {
        if (!silent) await replyTransientNotice(message, content);
    };

    if (command.modalOnly) {
        await notice(PREFIX_MESSAGES.modalOnlyCommand(commandName));
        return false;
    }

    const gate = await checkFeatureEnabled(command, message.guildId);
    if (!gate.allowed) {
        await notice(gate.message!);
        return false;
    }

    if (typeof (command.data as any).toJSON !== "function") return false;

    const { interaction, error } = await buildPrefixInteraction(message, client, command, argString, prefix);
    if (error) {
        await notice(error);
        return false;
    }

    // Checked after parsing rather than before, because which subcommand was named is only known
    // once the arguments have been read. Refusing here is the difference between "use the slash
    // command" and `interaction.showModal is not a function`.
    const subcommand = interaction.options.getSubcommand(false);
    if (subcommand && command.modalOnlySubcommands?.includes(subcommand)) {
        await notice(PREFIX_MESSAGES.modalOnlySubcommand(commandName, subcommand));
        return false;
    }

    try {
        const hasPerms = await checkPermissions(interaction, command, { silent });
        if (!hasPerms) return false;

        const canProceed = await cooldowns(interaction, command);
        if (!canProceed) return false;

        try {
            await command.run(interaction, client);
        } catch (err) {
            releaseCooldown(interaction);
            throw err;
        }

        if (deleteMode !== "none") {
            scheduleShortcutCleanup(message, await interaction.fetchReply(), deleteMode);
        }

        return true;
    } catch (err) {
        await commandError(err, interaction, client);
        return false;
    }
}
