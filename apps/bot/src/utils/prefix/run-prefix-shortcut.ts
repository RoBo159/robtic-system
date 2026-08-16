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
}

/** Shared by the prefix and custom-shortcut listeners — runs the same checkPermissions/cooldowns/run pipeline a real slash invocation would use. */
export async function runPrefixShortcut(invocation: PrefixInvocation): Promise<void> {
    const { message, client, command, commandName, argString, prefix, deleteMode = "none" } = invocation;

    if (command.modalOnly) {
        await replyTransientNotice(message, PREFIX_MESSAGES.modalOnlyCommand(commandName));
        return;
    }

    const gate = await checkFeatureEnabled(command, message.guildId);
    if (!gate.allowed) {
        await replyTransientNotice(message, gate.message!);
        return;
    }

    if (typeof (command.data as any).toJSON !== "function") return;

    const { interaction, error } = await buildPrefixInteraction(message, client, command, argString, prefix);
    if (error) {
        await replyTransientNotice(message, error);
        return;
    }

    // Checked after parsing rather than before, because which subcommand was named is only known
    // once the arguments have been read. Refusing here is the difference between "use the slash
    // command" and `interaction.showModal is not a function`.
    const subcommand = interaction.options.getSubcommand(false);
    if (subcommand && command.modalOnlySubcommands?.includes(subcommand)) {
        await replyTransientNotice(message, PREFIX_MESSAGES.modalOnlySubcommand(commandName, subcommand));
        return;
    }

    try {
        const hasPerms = await checkPermissions(interaction, command);
        if (!hasPerms) return;

        const canProceed = await cooldowns(interaction, command);
        if (!canProceed) return;

        try {
            await command.run(interaction, client);
        } catch (err) {
            releaseCooldown(interaction);
            throw err;
        }

        if (deleteMode !== "none") {
            scheduleShortcutCleanup(message, await interaction.fetchReply(), deleteMode);
        }
    } catch (err) {
        await commandError(err, interaction, client);
    }
}
