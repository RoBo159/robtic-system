import { Events, type GuildMember } from "discord.js";
import { SavedRolesRepository } from "@database/repositories";
import { Logger } from "@logger";

const MEMBER_RESTORE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FORMER_STAFF_MEMBER_RESTORE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
const STAFF_ROLE_RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

export default {
    name: Events.GuildMemberAdd,

    async execute(member: GuildMember) {
        if (member.user.bot) return;

        const saved = await SavedRolesRepository.find(member.guild.id, member.id);
        if (!saved) return;

        await SavedRolesRepository.remove(member.guild.id, member.id);

        const elapsed = Date.now() - saved.leftAt.getTime();

        // Docs written before the staff/other split only have the legacy flat `roles` field —
        // treat those as a plain member leave under the original flat window.
        const isLegacyDoc = !saved.wasStaff && saved.staffRoles.length === 0 && saved.otherRoles.length === 0 && saved.roles.length > 0;

        let rolesToRestore: string[] = [];
        if (isLegacyDoc) {
            if (elapsed <= MEMBER_RESTORE_WINDOW_MS) rolesToRestore = saved.roles;
        } else {
            const memberWindow = saved.wasStaff ? FORMER_STAFF_MEMBER_RESTORE_WINDOW_MS : MEMBER_RESTORE_WINDOW_MS;
            if (elapsed <= memberWindow) rolesToRestore = rolesToRestore.concat(saved.otherRoles);
            if (saved.wasStaff && elapsed <= STAFF_ROLE_RESTORE_WINDOW_MS) rolesToRestore = rolesToRestore.concat(saved.staffRoles);
        }

        if (rolesToRestore.length === 0) return;

        const filteredRoles = rolesToRestore.filter((id) => member.guild.roles.cache.has(id));

        // Add one role at a time (not as a single array call) so this doesn't race with the
        // other guildMemberAdd listeners (welcome/partner) that also grant roles concurrently —
        // a multi-role add() replaces the member's whole role list from a local cache snapshot,
        // which can silently drop a role added by another listener in the same tick.
        for (const roleId of filteredRoles) {
            await member.roles.add(roleId).catch((err) => {
                Logger.warn(`Could not restore role ${roleId} for ${member.id} in ${member.guild.id}: ${err}`, "role-restore");
            });
        }
    },
};
