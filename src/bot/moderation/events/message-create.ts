import { Events, type Message, type GuildTextBasedChannel, PermissionFlagsBits } from "discord.js";
import { ServerConfigRepository } from "@database/repositories/ServerConfigRepository";
import { ChatUtils } from "../utils/chat";
import { Logger } from "@core/libs";

export default {
    name: Events.MessageCreate,
    async execute(message: Message) {
        Logger.debug(`Received message: ${message.content} from ${message.author.tag} in ${message.guild?.name || "DM"}`);
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
                    switch (commandName) {
                        case 'slowmode':
                            result = await ChatUtils.slowmode(channel, args || "0");
                            break;
                        case 'clear':
                            const amount = parseInt(args);
                            result = await ChatUtils.clear(channel, isNaN(amount) ? 100 : amount);
                            break;
                        case 'lock':
                        case 'unlock':
                        case 'hide':
                        case 'show':
                            result = await (ChatUtils as any)[commandName](channel, message.guild);
                            break;
                        default:
                            const method = (ChatUtils as any)[commandName];
                            if (typeof method === 'function') {
                                if (args) {
                                    result = await method(channel, args, message.guild);
                                } else {
                                    result = await method(channel, message.guild);
                                }
                            }
                            break;
                    }

                    if (result) {
                        try {
                            if (commandName === 'clear') {
                                await channel.send({ content: `${result}` }).then(msg => {
                                    setTimeout(() => msg.delete().catch(() => { }), 3000);
                                });
                            } else {
                                await message.reply({ content: `${result}` }).then(msg => {
                                    setTimeout(() => msg.delete().catch(() => { }), 3000);
                                });
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
