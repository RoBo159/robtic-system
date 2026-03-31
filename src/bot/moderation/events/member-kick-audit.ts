import { Events, type GuildMember } from "discord.js";
import type { BotClient } from "@core/BotClient";
import { getModerationSecurityConfig, resolveLogChannel } from "../utils/security";
import { memberKickEmbed } from "../utils/embed";
import { detectKickAuditEntry } from "../utils/security";

export default {
    name: Events.GuildMemberRemove,
    async execute(member: GuildMember, client: BotClient) {
        if (member.user.bot) return;
        const kickInfo = await detectKickAuditEntry(member.guild, member.id);
        if (!kickInfo) return;
        const config = await getModerationSecurityConfig(member.guild.id);
        const channelId = config.settings.auditChannels.member_kick;
        if (!channelId) return;
        const channel = await resolveLogChannel(member.guild, channelId);
        if (!channel) return;
        await channel.send({ embeds: [memberKickEmbed(member, kickInfo.executorId, kickInfo.reason)] }).catch(() => null);
    },
};
