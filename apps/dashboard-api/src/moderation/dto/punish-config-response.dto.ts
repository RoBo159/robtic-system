/** The escalation ladder, shown beside the cases so a moderator can see why a case escalated. */
export interface PunishConfigResponse {
    shortcutRoleIds: string[];
    /** A single weight applied to every action, not a per-action map — see the PunishConfig schema. */
    pointsPerAction: number;
    proofChannelId: string | null;
}
