import { Events, type GuildMember } from "discord.js";
import type { BotClient } from "@core/BotClient";
import { getModerationSecurityConfig, resolveLogChannel } from "../utils/security";
import { memberJoinEmbed } from "../utils/embed";

export default {
    name: Events.GuildMemberAdd,
    async execute(member: GuildMember, client: BotClient) {
        const config = await getModerationSecurityConfig(member.guild.id);
        const channelId = config.settings.auditChannels.member_join;
        if (!channelId) return;
        const channel = await resolveLogChannel(member.guild, channelId);
        if (!channel) return;
        await channel.send({ embeds: [memberJoinEmbed(member)] }).catch(() => null);
    },
};
