import type { PunishmentType } from "../interfaces";

/** One case, as both the guild list and a member's record render it. */
export interface ModerationCaseResponse {
    caseId: string;
    type: PunishmentType;
    userId: string;
    moderatorId: string;
    reason: string;
    active: boolean;
    createdAt: Date;
    expiresAt: Date | null;
}

/**
 * A member's record omits `userId`: it is the `:userId` in the path, so repeating it on all fifty
 * rows is bytes spent restating the request.
 */
export type MemberCaseResponse = Omit<ModerationCaseResponse, "userId">;

/** One member's full history — what a moderator actually opens the dashboard for. */
export interface MemberRecordResponse {
    userId: string;
    total: number;
    activeCount: number;
    cases: MemberCaseResponse[];
}
