
import { Events, type Message } from "discord.js";
import type { BotClient } from "@core/BotClient";
import { getModerationSecurityConfig, resolveLogChannel } from "../utils/security";
import { messageDeleteEmbed } from "../utils/embed";

export default {
    name: Events.MessageDelete,
    async execute(message: Message, client: BotClient) {
        if (!message.guild || message.author?.bot) return;
        const config = await getModerationSecurityConfig(message.guild.id);
        const channelId = config.settings.auditChannels.message_delete;
        if (!channelId) return;
        const channel = await resolveLogChannel(message.guild, channelId);
        if (!channel) return;
        await channel.send({ embeds: [messageDeleteEmbed(message)] }).catch(() => null);
    },
};
