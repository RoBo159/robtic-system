import type { GuildMember } from "discord.js";
import { PartnerRepository } from "@database/repositories";
import { Logger } from "@logger";
import { isFeatureEnabled } from "@core/features";
import { ensurePartnerRole } from "../utils/partner-role";
import { buildPartnerListMessage } from "../utils/partner-explore-view";

/** Grants the partner role to an arriving representative, and DMs every newcomer the directory. */
export async function onMemberAdd(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    if (!(await isFeatureEnabled(member.guild.id, "partner"))) return;

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
}
