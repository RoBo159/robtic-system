import type { PermissionResolvable } from "discord.js";

export const STAFF_TEAM_ROLE_ID = "1479440690063736892";
export const FULL_POWER_ROLE_ID = "1362501792407228426";

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
        ids: ["1479427422280618157"],
        names: ["Lead Developer"],
        perms: ["Administrator"],
        department: "Dev",
    },
    LeadDesign: {
        ids: ["1479427422741856328"],
        names: ["Lead Designer"],
        perms: ["Administrator"],
        department: "Design",
    },
    LeadModerator: {
        ids: ["1479427423484514324"],
        names: ["Lead Moderator"],
        perms: ["Administrator"],
        department: "Moderation",
    },
    LeadCommunity: {
        ids: ["1479427423820054568"],
        names: ["Lead Community Manager"],
        perms: ["Administrator"],
        department: "Community",
    },
    LeadSupport: {
        ids: ["1479427424193220649"],
        names: ["Lead Support Manager"],
        perms: ["Administrator"],
        department: "Support",
    },

    StaffLead: {
        ids: ["1479427427196342336"],
        names: ["Staff Lead [ L ]"],
        perms: ["ManageGuild", "ManageChannels", "ManageRoles"],
    },
    SeniorStaffLead: {
        ids: ["1479427427683012730"],
        names: ["Senior Staff Lead [ L ]"],
        perms: ["ManageGuild", "ManageChannels"],
    },
    PrincipalStaff: {
        ids: ["1479427428219883541"],
        names: ["Principal Staff [ L ]"],
        perms: ["ManageGuild"],
    },

    DevManager: {
        ids: ["1479427429264003082"],
        names: ["Development Manager"],
        perms: ["ManageGuild", "ManageChannels"],
        department: "Dev",
    },
    DesignManager: {
        ids: ["1479427429792612352"],
        names: ["Design Manager"],
        perms: ["ManageGuild", "ManageChannels"],
        department: "Design",
    },
    CommunityManager: {
        ids: ["1479427430291869870"],
        names: ["Community Manager"],
        perms: ["ManageGuild", "ManageChannels"],
        department: "Community",
    },
    EventManager: {
        ids: ["1479427432376307803"],
        names: ["Events Manager"],
        perms: ["ManageGuild", "ManageChannels"],
        department: "Events",
    },
    SupportManager: {
        ids: ["1479427432405536829"],
        names: ["Support Manager"],
        perms: ["ManageGuild", "ManageRoles"],
        department: "Support",
    },
    ModerationManager: {
        ids: ["1479427433638920245"],
        names: ["Moderation Manager"],
        perms: ["KickMembers", "BanMembers", "ModerateMembers"],
        department: "Moderation",
    },
    HRManager: {
        ids: ["1479427436159697059"],
        names: ["HR Manager"],
        perms: ["ManageRoles"],
        department: "HR",
    },
    ContentManager: {
        ids: ["1479427434528116736"],
        names: ["Content Manager"],
        perms: ["ManageMessages", "ManageChannels"],
        department: "Community",
    },
    OperationManager: {
        ids: ["1479427436163764285"],
        names: ["Operations Manager"],
        perms: ["ManageGuild"],
        department: "Moderation",
    },

    Expert: {
        ids: ["1479427439888302161"],
        names: ["Expert I", "Expert II", "Expert III", "Expert IV", "Expert V"],
        perms: ["ManageMessages", "KickMembers"],
    },
    Professional: {
        ids: ["1479427444678332449"],
        names: ["Professional I", "Professional II", "Professional III", "Professional IV", "Professional V"],
        perms: ["ManageMessages"],
    },
    Associate: {
        ids: ["1479428088210260069"],
        names: ["Associate I", "Associate II", "Associate III", "Associate IV", "Associate V"],
        perms: ["ManageMessages"],
    },

    Member: {
        ids: ["1362501805941985492"],
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

export const MembersPunishments = {
    warn: {
        id: "1479443342390591528",
        name: "Warning",
        level: 20,
    },
    fWarn: {
        id: "1479486532405559409",
        name: "Final Warning",
        level: 40
    },
    tempMute: {
        id: "1479486539238211859",
        name: "Temporary Mute",
        level: 60
    },
    tempBan: {
        id: "1479486531784937542",
        name: "Temporary Ban",
        level: 80
    },
    permBan: {
        id: "1479486653788848271",
        name: "Permanent Ban",
        level: 100
    }
}

export const PunishmentsSystem = {
    warn: 5,
    mute: 10,
    ban: 20
}

export const StaffPunishments = [
    {
        id: "1479440695101227169",
        name: "Staff Reminder",
    },
    {
        id: "1479440695533244559",
        name: "Internal Warning"
    },
    {
        id: "1479440696459919472",
        name: "Performance Review"
    },
    {
        id: "1479440696967434313",
        name: "Rank Demotion"
    },
    {
        id: "1479440697357635584",
        name: "Staff Removal"
    },
]