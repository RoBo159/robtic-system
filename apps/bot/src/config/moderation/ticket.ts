import { BRANCH_CONFIG } from "@config";

export interface TicketCategory {
    /** Internal id — stored on the Ticket record and used as the panel select menu option value. */
    id: string;
    /** Shown as the select menu option label. */
    label: string;
    /** Shown as the select menu option description. */
    description: string;
    emoji?: string;
    /** Discord channel category ticket channels for this category are created under. */
    parentId: string;
    /** Role that gets channel access as soon as the ticket is created. */
    supportRoleId: string;
    /** Role granted access only once the ticket is escalated via /escalate. */
    adminRoleId: string;
    /** Points added to the closer's support-points stat (ActivityRepository.addSupportPoints) when this ticket is closed. */
    staffPoints: number;
}

/**
 * The single file to edit to add, remove, or reconfigure ticket categories.
 * No database, no per-guild config command — drop/edit an entry here and it
 * shows up in the panel's select menu (see /ticket-panel) immediately.
 */
export const TICKET_CATEGORIES: TicketCategory[] = [
    {
        id: "public-support",
        label: "الـدعـم الـفـنـي",
        description: "اذا تريد اي مساعدة لحل مشاكلك لا تترد في فتح تذكرة و سيكون طاقم دعم الفني في خدمة",
        emoji: "🎫",
        parentId: BRANCH_CONFIG.channels.ticketCategory,
        supportRoleId: BRANCH_CONFIG.roles.staffTeam,
        adminRoleId: BRANCH_CONFIG.roles.permissionMap.SupportManager[0],
        staffPoints: 1,
    },
    {
        id: "technical-support",
        label: "Technical Support",
        description: "Help with technical difficulties.",
        emoji: "🛠️",
        parentId: BRANCH_CONFIG.channels.ticketCategory,
        supportRoleId: BRANCH_CONFIG.roles.staffTeam,
        adminRoleId: BRANCH_CONFIG.roles.permissionMap.SupportManager[0],
        staffPoints: 1,
    },
    {
        id: "feature-request",
        label: "Feature Request",
        description: "Ask for a feature or improvement.",
        emoji: "💡",
        parentId: BRANCH_CONFIG.channels.ticketCategory,
        supportRoleId: BRANCH_CONFIG.roles.staffTeam,
        adminRoleId: BRANCH_CONFIG.roles.permissionMap.SupportManager[0],
        staffPoints: 1,
    },
    {
        id: "bug-report",
        label: "Bug Report",
        description: "Report bugs or mistakes.",
        emoji: "🐛",
        parentId: BRANCH_CONFIG.channels.ticketCategory,
        supportRoleId: BRANCH_CONFIG.roles.staffTeam,
        adminRoleId: BRANCH_CONFIG.roles.permissionMap.SupportManager[0],
        staffPoints: 1,
    },
];

export const TICKET_REPORT_CHANNEL_ID = BRANCH_CONFIG.channels.ticketSupportReport;
export const TICKET_MANAGER_EMOJI = BRANCH_CONFIG.emojis.ticketManager;

export const TICKET_PANEL_COLOR = 0x0505ff;
export const TICKET_CREATED_COLOR = TICKET_PANEL_COLOR;
export const TICKET_CLOSED_COLOR = 0x050560;
export const TICKET_ESCALATED_COLOR = 0xff8c00;
