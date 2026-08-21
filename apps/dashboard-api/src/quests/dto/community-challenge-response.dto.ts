import type { QuestMissionResponse } from "./quest-board-response.dto";

export interface CommunityContributorResponse {
    userId: string;
    username: string;
    amount: number;
}

export interface ActiveCommunityChallengeResponse {
    weekKey: string;
    status: string;
    missions: QuestMissionResponse[];
    target: number;
    total: number;
    contributorCount: number;
    rewardBase: number;
    minContribution: number;
    startedAt: Date;
    endsAt: Date;
    settledAt: Date | null;
}

/**
 * `active: null` when no challenge is running, rather than a 404.
 *
 * "No challenge this week" is a normal state of the community panel, not a missing resource — the
 * page renders an empty panel for it, and a 404 would make the dashboard's error path fire on a
 * perfectly healthy guild.
 */
export interface CommunityChallengeResponse {
    active: ActiveCommunityChallengeResponse | null;
    contributors?: CommunityContributorResponse[];
}
