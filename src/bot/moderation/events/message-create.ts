import { Events, type Message, type GuildTextBasedChannel, PermissionFlagsBits } from "discord.js";
import { ServerConfigRepository } from "@database/repositories/ServerConfigRepository";
import { ChatUtils } from "../utils/chat";

export default {
    name: Events.MessageCreate,
    async run(message: Message) {
        if (!message.guild || message.author.bot) return;

        if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) return;

        const shortcuts = await ServerConfigRepository.getShortcuts(message.guild.id);

        const sortedShortcuts = shortcuts.sort((a, b) => b.trigger.length - a.trigger.length);

        const content = message.content.trim();
        const match = sortedShortcuts.find(s =>
            content === s.trigger ||
            content.startsWith(s.trigger + " ")
        );

        if (match) {
            const channel = message.channel as GuildTextBasedChannel;
            const commandName = match.command as keyof typeof ChatUtils;

            let args = content.slice(match.trigger.length).trim();

            if (ChatUtils[commandName]) {
                try {
                    let result;
                    if (commandName === 'slowmode') {
                        result = await ChatUtils.slowmode(channel, args || "0");
                    } else if (commandName === 'clear') {
                        const amount = parseInt(args);
                        result = await ChatUtils.clear(channel, isNaN(amount) ? 100 : amount);
                    } else {
                        // Cast to any to access dynamic method calls
                        const method = (ChatUtils as any)[commandName];
                        if (typeof method === 'function') {
                            result = await method(channel, message.guild);
                        }
                    }

                    if (result) {
                        try {
                            if (commandName === 'clear') {
                                // For clear, send as new message because replying might fail if trigger was deleted
                                await channel.send({ content: `${result}` });
                            } else {
                                await message.reply({ content: `${result}` });
                            }
                        } catch (error) {
                             console.error("Error replying to shortcut:", error);
                        }
                    }
                } catch (error) {
                    console.error("Error executing shortcut:", error);
                }
            }
        }
    }
};
