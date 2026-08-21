import { Events, type Message, type GuildMember } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { DEFAULT_PREFIX, STREAK_CONFIG, isChannelRestricted } from "@constants";
import { ServerConfigRepository, PunishConfigRepository } from "@database/repositories";
import { parsePrefixCommand, runPrefixShortcut } from "../utils/prefix";
import { getUserLang, t } from "../utils/lang";

/**
 * The single `!command` router.
 *
 * Every system used to ship its own copy of this listener. On one client that meant a message was
 * parsed six times and, for any command more than one of them claimed, actually executed more than
 * once. There is one listener now, and the per-system exceptions that justified the copies survive
 * as the branches below.
 */

/**
 * Carry an extra proof-of-evidence flow, so prefix use is gated by PunishConfig.shortcutRoleIds
 * rather than the normal permission check. `jail` is the punishment-system command formerly called
 * `ban`; the `/ban` that took its name is a plain Discord ban with no proof flow, and is gated
 * normally.
 */
const PUNISH_SHORTCUT_COMMANDS = new Set(["jail", "mute", "warn"]);

/** True when the member holds one of the roles allowed to drive this command from chat. */
async function passesShortcutRoleGate(guildId: string, member: GuildMember): Promise<boolean> {
    const config = await PunishConfigRepository.getCached(guildId);
    return config.shortcutRoleIds.some(id => member.roles.cache.has(id));
}

/**
 * Player-facing commands are confined to the configured commands channel; staff and operational
 * ones are not. Confining an admin fixing a broken config, or a moderator checking server status
 * mid-incident, only adds friction where it is least wanted. See UNRESTRICTED_COMMAND_CATEGORIES.
 */
async function enforceCommandsChannel(message: Message, category: string | undefined): Promise<boolean> {
    if (!isChannelRestricted(category)) return true;

    const commandsChannelId = await ServerConfigRepository.getCommandsChannel(message.guild!.id);
    if (!commandsChannelId || message.channel.id === commandsChannelId) return true;

    await message.delete().catch(() => null);

    if (message.channel.isSendable()) {
        const lang = await getUserLang(message.member as GuildMember | null);
        const notice = await message.channel
            .send({ content: t("commandsChannel.wrong_channel_notice", lang, { user: `<@${message.author.id}>`, channel: `<#${commandsChannelId}>` }) })
            .catch(() => null);
        if (notice) {
            setTimeout(() => {
                notice.delete().catch(() => null);
            }, STREAK_CONFIG.autoDeleteMs);
        }
    }

    return false;
}

export default {
    name: Events.MessageCreate,
    async execute(message: Message, client: BotClient) {
        if (message.author.bot || !message.guild || !message.member) return;

        const prefix = (await ServerConfigRepository.getPrefix(message.guild.id)) ?? DEFAULT_PREFIX;
        const parsed = parsePrefixCommand(message, prefix);
        if (!parsed) return;

        const { commandName, argString } = parsed;

        const command = client.commands.get(commandName);
        const messageCommand = client.messageCommands.get(commandName);
        if (!command && !messageCommand) return;

        if (PUNISH_SHORTCUT_COMMANDS.has(commandName)) {
            if (!(await passesShortcutRoleGate(message.guild.id, message.member as GuildMember))) return;
        } else if (!(await enforceCommandsChannel(message, command?.category))) {
            return;
        }

        if (messageCommand && (await messageCommand.run({ message, client, prefix, argString, command }))) return;
        if (!command) return;

        await runPrefixShortcut({ message, client, command, commandName, argString, prefix });
    },
};
