import { Events, type GuildMember } from "discord.js";
import { PartnerRepository } from "@database/repositories";
import { Logger } from "@logger";
import { ensurePartnerRole } from "../utils/partner-role";
import { buildPartnerListMessage } from "../utils/partner-explore-view";

export default {
    name: Events.GuildMemberAdd,

    async execute(member: GuildMember) {
        if (member.user.bot) return;

        const partner = await PartnerRepository.findByRepUserId(member.id);
        if (partner) {
            const role = await ensurePartnerRole(member.guild);
            await member.roles.add(role).catch((err) => {
                Logger.warn(`Could not grant partner role to ${member.id} in ${member.guild.id}: ${err}`, "partner");
            });
        }

        const partners = await PartnerRepository.getAll();
        if (partners.length === 0) return;

        await member.send(buildPartnerListMessage(partners)).catch((err) => {
            Logger.debug(`Could not DM partner list to ${member.id}: ${err}`, "partner");
        });
    },
};
