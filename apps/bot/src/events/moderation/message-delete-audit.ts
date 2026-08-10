
import { Events, type Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { getModerationSecurityConfig, resolveLogChannel } from "../../utils/moderation/security";
import { messageDeleteEmbed } from "../../utils/moderation/embed";
import { sendToServerLog } from "@bot/utils/server-log";

export default {
    name: Events.MessageDelete,
    async execute(message: Message, client: BotClient) {
        if (!message.guild || message.author?.bot) return;
        const embed = messageDeleteEmbed(message);

        const config = await getModerationSecurityConfig(message.guild.id);
        const channelId = config.settings.auditChannels.message_delete;
        if (channelId) {
            const channel = await resolveLogChannel(message.guild, channelId);
            if (channel) await channel.send({ embeds: [embed] }).catch(() => null);
        }

        await sendToServerLog(client, message.guild.id, "message-delete", embed);
    },
};
