import type { Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import { PREFIX_MESSAGES, PREFIX_USAGE_DELETE_MS, type ShortcutDeleteMode } from "@constants";
import { checkPermissions, cooldowns, commandError, releaseCooldown } from "@bot/utils/interaction";
import { buildPrefixInteraction } from "./build-prefix-interaction";
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

/**
 * Sends a short-lived usage/validation notice, then deletes both the bot's reply and the user's
 * triggering message after PREFIX_USAGE_DELETE_MS so a mistyped command doesn't linger in chat.
 */
async function replyTransientNotice(message: Message, content: string): Promise<void> {
    const notice = await message.reply({ content, allowedMentions: { repliedUser: false } }).catch(() => null);
    setTimeout(() => {
        notice?.delete().catch(() => null);
        message.delete().catch(() => null);
    }, PREFIX_USAGE_DELETE_MS);
}

/** Shared by the prefix and custom-shortcut listeners — runs the same checkPermissions/cooldowns/run pipeline a real slash invocation would use. */
export async function runPrefixShortcut(invocation: PrefixInvocation): Promise<void> {
    const { message, client, command, commandName, argString, prefix, deleteMode = "none" } = invocation;

    if (command.modalOnly) {
        await replyTransientNotice(message, PREFIX_MESSAGES.modalOnlyCommand(commandName));
        return;
    }

    if (typeof (command.data as any).toJSON !== "function") return;

    const { interaction, error } = await buildPrefixInteraction(message, client, command, argString, prefix);
    if (error) {
        await replyTransientNotice(message, error);
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
