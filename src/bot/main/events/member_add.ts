import { Events, type GuildMember } from "discord.js";
import data from "@shared/data.json";

export default {
    name: Events.GuildMemberAdd,

    async execute(member: GuildMember) {
        const role = member.guild.roles.cache.get(data.members_role_id);
        const channel = member.guild.channels.cache.get(data.general_chat_channel_id);

        if (channel?.isTextBased()) {
            await channel.send(`🎉 Welcome <@${member.id}> to the Robtic Server!`);
        }

        if (role) {
            await member.roles.add(role);
        } else {
            console.log("Role not found");
        }
    }
};