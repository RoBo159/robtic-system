export type TopCategory = "streak" | "combo" | "xp" | "messages" | "voice" | "points" | "coins";
export type TopPeriod = "daily" | "weekly" | "monthly" | "alltime";

export interface ProfilePartner {
    username: string;
    avatarUrl: string | null;
}

export interface ProfileCustomization {
    color: string | null;
    textColor: string | null;
    bannerUrl: string | null;
    bio: string | null;
    template: string | null;
}

export interface ProfileBadge {
    id: string;
    label: string;
}

export interface Profile {
    discordId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isPrivate: boolean;
    isSelf: boolean;
    customization: ProfileCustomization;
    coins: number;
    badges: ProfileBadge[];
    xp: {
        totalXP: number;
        level: number;
        progress: number;
        needed: number;
        rank: number;
        messageCount: number;
    };
    streak: {
        current: number;
        best: number;
        active: boolean;
        rank: number;
        bestRank: number;
        nextClaimMs: number;
        expiresInMs: number | null;
    };
    combo: {
        activeScore: number | null;
        activePartnerId: string | null;
        activeLevel: string | null;
        bestScore: number;
        totalConversations: number;
        favoritePartnerId: string | null;
    };
    /** All durations in seconds. */
    voice: {
        totalConnectedSeconds: number;
        totalActiveSeconds: number;
        totalXpEarned: number;
        sessionCount: number;
        longestSessionSeconds: number;
        averageSessionSeconds: number;
        rank: number;
        lastSeenAt: number | null;
    };
    points: {
        points: number;
        lifetimePoints: number;
        rc: number;
        rank: number;
    };
    partners: Record<string, ProfilePartner>;
}

export interface SearchResult {
    discordId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    level: number;
}

export interface LeaderboardRow {
    discordId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    value: number;
    rank: number;
}

export interface LeaderboardResponse {
    category: TopCategory;
    period: TopPeriod;
    rows: LeaderboardRow[];
    viewer: LeaderboardRow | null;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

export interface ProfileActivityLog {
    type: string;
    amount: number;
    details: string | null;
    createdAt: number;
}

export interface ProfileActivityDetails {
    realMessageCount: number;
    decayEnabled: boolean;
    decayLastActiveAt: number | null;
    decayInactiveDays: number;
    recent: ProfileActivityLog[];
}

export interface ProfileStaffDetails {
    supportPoints: number;
    publicChatPoints: number;
    staffChatPoints: number;
    moderationPoints: number;
    penalties: number;
    totalStaffPoints: number;
    sessionsClaimed: number;
    sessionsResolved: number;
    avgResponseMs: number;
    supportPointsEarned: number;
}

export interface ProfileNoteEntry {
    content: string;
    createdBy: string;
    createdAt: number;
}

export interface ProfileProjectEntry {
    projectId: string;
    title: string;
    projectType: string;
    likes: number;
    dislikes: number;
    views: number;
    createdAt: number;
}

export interface ProfilePunishmentEntry {
    caseId: string;
    type: string;
    reason: string;
    active: boolean;
    appealed: boolean;
    createdAt: number;
}

/** The dropdown sections beyond the snapshot; noteAuthors maps createdBy ids to usernames. */
export interface ProfileDetails {
    activity: ProfileActivityDetails;
    staff: ProfileStaffDetails | null;
    notes: ProfileNoteEntry[];
    projects: ProfileProjectEntry[];
    punishments: ProfilePunishmentEntry[];
    punishmentLevel: number;
    noteAuthors: Record<string, string>;
}
