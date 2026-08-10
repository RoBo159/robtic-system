import { Events, type GuildMember } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { getModerationSecurityConfig, resolveLogChannel } from "../../utils/moderation/security";
import { memberLeaveEmbed } from "../../utils/moderation/embed";
import { sendToServerLog } from "@bot/utils/server-log";

export default {
    name: Events.GuildMemberRemove,
    async execute(member: GuildMember, client: BotClient) {
        const embed = memberLeaveEmbed(member);

        const config = await getModerationSecurityConfig(member.guild.id);
        const channelId = config.settings.auditChannels.member_leave;
        if (channelId) {
            const channel = await resolveLogChannel(member.guild, channelId);
            if (channel) await channel.send({ embeds: [embed] }).catch(() => null);
        }

        await sendToServerLog(client, member.guild.id, "member-leave", embed);
    },
};
