import { PermissionFlagsBits, type Guild, type GuildMember, type Role } from "discord.js";
import { MODERATION_ACTION_MESSAGES as MSG } from "@constants";
import { isGuildOperator } from "@bot/utils/access";

/** Null when the role may be assigned, otherwise the reason it may not. */
export function checkRoleAssignable(guild: Guild, executor: GuildMember, role: Role): string | null {
    if (role.id === guild.id) return MSG.roleEveryone;
    if (role.managed) return MSG.roleManagedByIntegration(role.name);

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return MSG.rolesMissingPermission;
    if (role.comparePositionTo(me.roles.highest) >= 0) return MSG.roleUnmanageable(role.name);

    const exempt = executor.id === guild.ownerId || isGuildOperator(executor);
    if (!exempt && role.comparePositionTo(executor.roles.highest) >= 0) return MSG.roleAboveExecutor(role.name);

    return null;
}
