import { Events, type GuildMember } from "discord.js";
import { SavedRolesRepository, StaffRepository, StaffTierRepository } from "@database/repositories";
import { Logger } from "@logger";

export default {
    name: Events.GuildMemberRemove,

    async execute(member: GuildMember) {
        if (member.user.bot) return;

        // Banned members never get roles restored, even if later unbanned and they rejoin —
        // by the time GuildMemberRemove fires for a ban, the ban entry already exists (the ban is
        // what caused the removal), so this reliably tells a ban apart from a kick/voluntary leave.
        const banEntry = await member.guild.bans.fetch(member.id).catch(() => null);
        if (banEntry) return;

        const roleIds = member.roles.cache
            .filter((role) => role.id !== member.guild.id && !role.managed)
            .map((role) => role.id);

        if (roleIds.length === 0) return;

        const staffRecord = await StaffRepository.findByDiscordId(member.id).catch(() => null);
        const wasStaff = !!staffRecord;

        let staffRoleIds: string[] = [];
        let otherRoleIds = roleIds;

        if (wasStaff) {
            const tiers = await StaffTierRepository.list(member.guild.id);
            const staffRoleSet = new Set(tiers.flatMap((tier) => tier.roleIds));
            staffRoleIds = roleIds.filter((id) => staffRoleSet.has(id));
            otherRoleIds = roleIds.filter((id) => !staffRoleSet.has(id));
        }

        await SavedRolesRepository.save(member.guild.id, member.id, {
            staffRoles: staffRoleIds,
            otherRoles: otherRoleIds,
            wasStaff,
        }).catch((err) => {
            Logger.warn(`Could not save roles for ${member.id} leaving ${member.guild.id}: ${err}`, "role-restore");
        });
    },
};
