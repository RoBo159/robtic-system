import type { PermissionResolvable } from "discord.js";

export const STAFF_TEAM_ROLE_ID = "1479440690063736892";

export const ROLE_MAP: Record<
    PermissionLevel,
    { ids: string[]; names: string[]; perms: PermissionResolvable[]; department?: Department }
> = {
    Owner: {
        ids: ["1362501793128648976"],
        names: ["Owner", "CEO"],
        perms: ["Administrator"],
    },

    LeadDev: {
        ids: [],
        names: ["Lead Developer"],
        perms: ["Administrator"],
        department: "Dev",
    },
    LeadDesign: {
        ids: [],
        names: ["Lead Designer"],
        perms: ["Administrator"],
        department: "Design",
    },
    LeadModerator: {
        ids: [],
        names: ["Lead Moderator"],
        perms: ["Administrator"],
        department: "Moderation",
    },
    LeadCommunity: {
        ids: [],
        names: ["Lead Community Manager"],
        perms: ["Administrator"],
        department: "Community",
    },
    LeadSupport: {
        ids: [],
        names: ["Lead Support Manager"],
        perms: ["Administrator"],
        department: "Support",
    },

    StaffLead: {
        ids: [],
        names: ["Staff Lead [ L ]"],
        perms: ["ManageGuild", "ManageChannels", "ManageRoles"],
    },
    SeniorStaffLead: {
        ids: [],
        names: ["Senior Staff Lead [ L ]"],
        perms: ["ManageGuild", "ManageChannels"],
    },
    PrincipalStaff: {
        ids: [],
        names: ["Principal Staff [ L ]"],
        perms: ["ManageGuild"],
    },

    DevManager: {
        ids: [],
        names: ["Development Manager"],
        perms: ["ManageGuild", "ManageChannels"],
        department: "Dev",
    },
    DesignManager: {
        ids: [],
        names: ["Design Manager"],
        perms: ["ManageGuild", "ManageChannels"],
        department: "Design",
    },
    CommunityManager: {
        ids: [],
        names: ["Community Manager"],
        perms: ["ManageGuild", "ManageChannels"],
        department: "Community",
    },
    EventManager: {
        ids: [],
        names: ["Events Manager"],
        perms: ["ManageGuild", "ManageChannels"],
        department: "Events",
    },
    SupportManager: {
        ids: [],
        names: ["Support Manager"],
        perms: ["ManageGuild", "ManageRoles"],
        department: "Support",
    },
    ModerationManager: {
        ids: [],
        names: ["Moderation Manager"],
        perms: ["KickMembers", "BanMembers", "ModerateMembers"],
        department: "Moderation",
    },
    HRManager: {
        ids: [],
        names: ["HR Manager"],
        perms: ["ManageRoles"],
        department: "HR",
    },
    ContentManager: {
        ids: [],
        names: ["Content Manager"],
        perms: ["ManageMessages", "ManageChannels"],
        department: "Community",
    },
    OperationManager: {
        ids: [],
        names: ["Operations Manager"],
        perms: ["ManageGuild"],
        department: "Moderation",
    },

    Expert: {
        ids: [],
        names: ["Expert I", "Expert II", "Expert III", "Expert IV", "Expert V"],
        perms: ["ManageMessages", "KickMembers"],
    },
    Professional: {
        ids: [],
        names: ["Professional I", "Professional II", "Professional III", "Professional IV", "Professional V"],
        perms: ["ManageMessages"],
    },
    Associate: {
        ids: [],
        names: ["Associate I", "Associate II", "Associate III", "Associate IV", "Associate V"],
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

    LeadDev: 90,
    LeadDesign: 90,
    LeadModerator: 90,
    LeadCommunity: 90,
    LeadSupport: 90,

    StaffLead: 87,
    SeniorStaffLead: 85,
    PrincipalStaff: 83,

    DevManager: 80,
    DesignManager: 80,
    CommunityManager: 80,
    EventManager: 80,
    SupportManager: 80,
    ModerationManager: 80,
    HRManager: 80,
    ContentManager: 80,
    OperationManager: 80,

    Expert: 60,
    Professional: 40,
    Associate: 20,

    Member: 0,
};

export const LEAD_MANAGER_MAP: Record<string, PermissionLevel[]> = {
    LeadDev: ["DevManager"],
    LeadDesign: ["DesignManager"],
    LeadModerator: ["OperationManager", "ModerationManager"],
    LeadCommunity: ["CommunityManager", "ContentManager", "EventManager"],
    LeadSupport: ["HRManager", "SupportManager"],
};

export const MANAGER_DEPARTMENT_MAP: Record<string, Department> = {
    DevManager: "Dev",
    DesignManager: "Design",
    CommunityManager: "Community",
    EventManager: "Events",
    SupportManager: "Support",
    ModerationManager: "Moderation",
    HRManager: "HR",
    ContentManager: "Community",
    OperationManager: "Moderation",
};

export const DEPARTMENT_ROLES: Record<Department, string[]> = {
    Dev: ["Development Department"],
    Design: ["Design Department"],
    Moderation: ["Moderation Department"],
    Community: ["Community Department"],
    Events: ["Events Department"],
    Support: ["Support Department"],
    HR: ["HR Department"],
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
