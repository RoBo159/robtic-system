import { Events, type Message, type GuildMember } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { DEFAULT_PREFIX, STREAK_CONFIG, isChannelRestricted } from "@constants";
import { ServerConfigRepository } from "@database/repositories";
import { parsePrefixCommand, runPrefixShortcut } from "@shared/utils/prefix";
import { getUserLang, t } from "@shared/utils/lang";

export default {
    name: Events.MessageCreate,
    async execute(message: Message, client: BotClient) {
        if (message.author.bot || !message.guild) return;

        const prefix = (await ServerConfigRepository.getPrefix(message.guild.id)) ?? DEFAULT_PREFIX;
        const parsed = parsePrefixCommand(message, prefix);
        if (!parsed) return;
        const { commandName, argString } = parsed;

        const command = client.commands.get(commandName);
        if (!command) return;

        // Player-facing commands are confined to the configured commands channel; staff and
        // operational ones are not. Confining an admin fixing a broken config, or a moderator
        // checking server status mid-incident, only adds friction where it is least wanted.
        // See UNRESTRICTED_COMMAND_CATEGORIES for which categories are exempt and why.
        const commandsChannelId = isChannelRestricted(command.category)
            ? await ServerConfigRepository.getCommandsChannel(message.guild.id)
            : null;

        if (commandsChannelId && message.channel.id !== commandsChannelId) {
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
            return;
        }

        await runPrefixShortcut(message, client, command, commandName, argString, prefix);
    },
};
