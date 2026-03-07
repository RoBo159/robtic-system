import { GuildMember } from "discord.js";
import {
    ROLE_MAP,
    PERMISSION_HIERARCHY,
    LEAD_MANAGER_MAP,
    MANAGER_DEPARTMENT_MAP,
    DEPARTMENT_ROLES,
    STAFF_TEAM_ROLE_ID,
} from "@core/config";

export function getMemberLevel(member: GuildMember): { level: PermissionLevel; score: number } {
    let best: PermissionLevel = "Member";
    let bestScore = 0;

    for (const [level, config] of Object.entries(ROLE_MAP)) {
        const score = PERMISSION_HIERARCHY[level] ?? 0;
        if (score <= bestScore) continue;

        const match =
            (config.ids.length > 0 && member.roles.cache.some(r => config.ids.includes(r.id))) ||
            (config.names.length > 0 && member.roles.cache.some(r =>
                config.names.some(n => r.name.toLowerCase() === n.toLowerCase())
            ));

        if (match) {
            best = level as PermissionLevel;
            bestScore = score;
        }
    }

    return { level: best, score: bestScore };
}

export function isInDepartment(member: GuildMember, department: Department): boolean {
    const depRoleNames = DEPARTMENT_ROLES[department];
    if (!depRoleNames) return false;

    return member.roles.cache.some(r =>
        depRoleNames.some(n => r.name.toLowerCase() === n.toLowerCase())
    );
}

export function getMemberDepartments(member: GuildMember): Department[] {
    return (Object.keys(DEPARTMENT_ROLES) as Department[]).filter(dep =>
        isInDepartment(member, dep)
    );
}

export function isManagerOf(member: GuildMember, department: Department): boolean {
    for (const [managerLevel, dept] of Object.entries(MANAGER_DEPARTMENT_MAP)) {
        if (dept !== department) continue;
        const config = ROLE_MAP[managerLevel as PermissionLevel];
        if (!config) continue;

        const match =
            (config.ids.length > 0 && member.roles.cache.some(r => config.ids.includes(r.id))) ||
            (config.names.length > 0 && member.roles.cache.some(r =>
                config.names.some(n => r.name.toLowerCase() === n.toLowerCase())
            ));
        if (match) return true;
    }
    return false;
}

export function isLeadOf(member: GuildMember, department: Department): boolean {
    for (const [leadLevel, managedLevels] of Object.entries(LEAD_MANAGER_MAP)) {
        const config = ROLE_MAP[leadLevel as PermissionLevel];
        if (!config) continue;

        const hasLeadRole =
            (config.ids.length > 0 && member.roles.cache.some(r => config.ids.includes(r.id))) ||
            (config.names.length > 0 && member.roles.cache.some(r =>
                config.names.some(n => r.name.toLowerCase() === n.toLowerCase())
            ));
        if (!hasLeadRole) continue;

        for (const ml of managedLevels) {
            if (MANAGER_DEPARTMENT_MAP[ml] === department) return true;
        }
    }
    return false;
}

export function isOwner(member: GuildMember): boolean {
    const config = ROLE_MAP.Owner;
    return (
        (config.ids.length > 0 && member.roles.cache.some(r => config.ids.includes(r.id))) ||
        (config.names.length > 0 && member.roles.cache.some(r =>
            config.names.some(n => r.name.toLowerCase() === n.toLowerCase())
        ))
    );
}

export function hasDepartmentAuthority(member: GuildMember, department: Department): boolean {
    return isOwner(member) || isLeadOf(member, department) || isManagerOf(member, department);
}

export function isStaff(member: GuildMember): boolean {
    if (member.roles.cache.has(STAFF_TEAM_ROLE_ID)) return true;
    const { score } = getMemberLevel(member);
    return score >= (PERMISSION_HIERARCHY["Associate"] ?? 20);
}

export function isAnyManager(member: GuildMember): boolean {
    const { score } = getMemberLevel(member);
    return score >= 80;
}

export function isAnyLead(member: GuildMember): boolean {
    const { score } = getMemberLevel(member);
    return score >= 90;
}
