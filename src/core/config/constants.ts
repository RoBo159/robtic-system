import type { PermissionResolvable } from "discord.js";

export const ROLE_MAP: Record<
    PermissionLevel,
    { ids: string[]; names: string[]; perms: PermissionResolvable[] }
> = {
    Owner: {
        ids: ["123456789012345678"],
        names: ["Owner", "CEO", "Overlord"],
        perms: ["Administrator"],
    },
    Lead: {
        ids: [],
        names: ["Lead", "Director"],
        perms: ["Administrator"],
    },
    Manager: {
        ids: [],
        names: ["Manager", "Admin", "GuildManager"],
        perms: ["ManageGuild", "ManageRoles", "ManageChannels"],
    },
    Staff: {
        ids: [],
        names: ["Staff", "Team"],
        perms: ["ManageMessages", "KickMembers"],
    },
    HR: {
        ids: [],
        names: ["HR", "Human Resources"],
        perms: ["ManageRoles"],
    },
    Moderator: {
        ids: [],
        names: ["Moderator", "Mod"],
        perms: ["KickMembers", "BanMembers", "ModerateMembers"],
    },
    Support: {
        ids: [],
        names: ["Support", "Helper"],
        perms: ["ManageMessages"],
    },
    Member: {
        ids: [],
        names: [],
        perms: [],
    },
};

export const PERMISSION_HIERARCHY: Record<string, number> = {
    Owner: 100,
    Lead: 90,
    Manager: 80,
    Staff: 60,
    HR: 55,
    Moderator: 50,
    Support: 40,
    Member: 0,
};

export const Colors = {
    default: 0x5865F2,
    success: 0x4CAF50,
    error: 0xFF4C4C,
    info: 0x3498DB,
    warning: 0xFFC107,
    moderation: 0xE74C3C,
    ticket: 0x9B59B6,
    hr: 0xF39C12,
    activity: 0x2ECC71,
} as const;

export type ColorKey = keyof typeof Colors;
