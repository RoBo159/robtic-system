import type { Request, Response, NextFunction } from "express";
import { ClientManager } from "@core/ClientManager";
import { PERMISSION_HIERARCHY, ROLE_MAP, DEPARTMENT_ROLES } from "@core/config";
import type { GuildMember } from "discord.js";

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
    if (req.isAuthenticated?.() && req.user) {
        return next();
    }
    res.status(401).json({ error: "Unauthorized" });
}

function getMemberLevel(member: GuildMember): { level: string; score: number } {
    let best = "Member";
    let bestScore = 0;

    for (const [level, config] of Object.entries(ROLE_MAP)) {
        const score = PERMISSION_HIERARCHY[level] ?? 0;
        if (score <= bestScore) continue;

        const match =
            (config.ids.length > 0 && member.roles.cache.some((r) => config.ids.includes(r.id))) ||
            (config.names.length > 0 &&
                member.roles.cache.some((r) =>
                    config.names.some((n) => r.name.toLowerCase() === n.toLowerCase()),
                ));

        if (match) {
            best = level;
            bestScore = score;
        }
    }

    return { level: best, score: bestScore };
}

function memberInDepartment(member: GuildMember, department: string): boolean {
    const depRoleNames = DEPARTMENT_ROLES[department as keyof typeof DEPARTMENT_ROLES];
    if (!depRoleNames) return false;
    return member.roles.cache.some((r) =>
        depRoleNames.some((n) => r.name.toLowerCase() === n.toLowerCase()),
    );
}

export async function getGuildMember(userId: string): Promise<GuildMember | null> {
    const manager = ClientManager.getInstance();
    const guildId = process.env.MainGuild!;

    // Try any available bot that has the guild cached
    const botNames: BotName[] = ["modmail", "main", "moderation", "hr", "support"];
    for (const name of botNames) {
        const client = manager.getClient(name);
        if (!client?.isReady()) continue;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) return member;
    }

    return null;
}

export async function loadGuildMember(req: Request, _res: Response, next: NextFunction) {
    if (req.user) {
        (req as any).__guildMember = await getGuildMember(req.user.id);
    }
    next();
}

export function requireModAccess(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const member = (req as any).__guildMember as GuildMember | null;
    if (!member) {
        return res.status(403).json({ error: "Not a staff server member" });
    }

    const { score } = getMemberLevel(member);

    // Owner (100), Leads (90), Leaders (87-83), Managers (80)
    const isLeaderOrAbove = score >= 83;
    const isModDepartment = memberInDepartment(member, "Moderation");

    if (isLeaderOrAbove || isModDepartment) {
        return next();
    }

    return res.status(403).json({ error: "Only Mod Department and Leaders can access this" });
}
