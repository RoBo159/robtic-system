import { Events, type GuildMember } from "discord.js";
import { ServerConfigRepository } from "@database/repositories";
import { BRANCH_CONFIG } from "@config";

export default {
    name: Events.GuildMemberAdd,

    async execute(member: GuildMember) {
        if (member.user.bot) return;

        const config = await ServerConfigRepository.find(member.guild.id);
        const membersRoleId = config?.roles?.members;
        const role = membersRoleId ? member.guild.roles.cache.get(membersRoleId) : null;

        const channels = BRANCH_CONFIG.channels.generalChat;
        channels.forEach(async id => {
            const channel = member.guild.channels.cache.get(id);
            if (channel?.isTextBased() && process.env.NODE_ENV === "production") {
                await channel.send(`🎉 Welcome <@${member.id}> to the ${BRANCH_CONFIG.server.fullName}!`);
            }
        });

        if (role) {
            await member.roles.add(role);
        } else {
            console.log("Members role not configured — use /set-role type:members");
        }
    }
};
