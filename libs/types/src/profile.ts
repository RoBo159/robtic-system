import type { ComboLeaderboardPeriod, TopCategory } from "@constants";

/** XP standing for one member of one guild. */
export interface ProfileXp {
    totalXP: number;
    level: number;
    /** XP earned inside the current level. */
    progress: number;
    /** XP needed to complete the current level. */
    needed: number;
    rank: number;
    messageCount: number;
}

export interface ProfileStreak {
    current: number;
    best: number;
    active: boolean;
    rank: number;
    bestRank: number;
    /** Milliseconds until the next claim is available; 0 when claimable now. */
    nextClaimMs: number;
    /** Milliseconds until the streak lapses, or null when there's no active streak. */
    expiresInMs: number | null;
}

export interface ProfileCombo {
    /** Live combo score, present only while a conversation is active. */
    activeScore: number | null;
    activePartnerId: string | null;
    activeLevel: string | null;
    bestScore: number;
    totalConversations: number;
    favoritePartnerId: string | null;
}

/** Time in voice for one member of one guild. All durations in seconds. */
export interface ProfileVoice {
    /** Everything the member spent connected, AFK or not. */
    totalConnectedSeconds: number;
    /** The subset that counted as active and therefore earned. */
    totalActiveSeconds: number;
    /** Voice's share of the member's XP — the same XP as chat, tracked separately for display. */
    totalXpEarned: number;
    sessionCount: number;
    longestSessionSeconds: number;
    /** Active seconds divided by sessions; 0 when there are none. */
    averageSessionSeconds: number;
    /** Rank by active time. 0 when the member has no voice record. */
    rank: number;
    /** Unix ms of the last time they were seen in voice, or null. */
    lastSeenAt: number | null;
}

/** The activity wallet: Points earned from chat/combo/voice/streaks, and RC converted from them. */
export interface ProfilePoints {
    points: number;
    /** Only ever climbs — spending doesn't reduce it. */
    lifetimePoints: number;
    rc: number;
    /** Rank by current point balance. 0 when the member has no wallet. */
    rank: number;
}

/** A small achievement badge rendered next to the profile name. */
export interface ProfileBadge {
    /** "fire<min>-<max>" streak tiers, or "top-combo" / "top-streak" for server #1s. */
    id: string;
    label: string;
}

/** Self-set look of a profile, shown to every viewer. */
export interface ProfileCustomization {
    /** Theme hex color ("#rrggbb") tinting the whole profile, or null for the default theme. */
    color: string | null;
    /** Text hex color, or null for the default text palette. */
    textColor: string | null;
    bannerUrl: string | null;
    bio: string | null;
    /** One of PROFILE_TEMPLATES; null falls back to "classic". */
    template: string | null;
}

/** Everything the Activity's profile view renders for one user. */
export interface ProfileSnapshot {
    discordId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    /** True when the viewer isn't allowed to see the detail sections. */
    isPrivate: boolean;
    isSelf: boolean;
    customization: ProfileCustomization;
    /** The Minecraft wallet, moved over /api/economy. Discord activity earns `points` instead. */
    coins: number;
    badges: ProfileBadge[];
    xp: ProfileXp;
    streak: ProfileStreak;
    combo: ProfileCombo;
    voice: ProfileVoice;
    points: ProfilePoints;
}

/** One row of the Activity's user-search autocomplete. */
export interface ProfileSearchResult {
    discordId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    level: number;
}

/** One ranked row returned to the Activity's leaderboard view. */
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
    period: ComboLeaderboardPeriod;
    rows: LeaderboardRow[];
    /** The viewer's own row, included even when outside the returned page. */
    viewer: LeaderboardRow | null;
    /** 1-based page of the ranking being returned. */
    page: number;
    pageSize: number;
    /** True when another page of ranked members exists after this one. */
    hasMore: boolean;
}

/** One recent XP-log line shown in the profile's activity section. */
export interface ProfileActivityLog {
    type: string;
    amount: number;
    details: string | null;
    /** Unix ms. */
    createdAt: number;
}

/** Deep-dive XP data — the Activity dropdown's "Activity" selection. */
export interface ProfileActivityDetails {
    realMessageCount: number;
    decayEnabled: boolean;
    /** Unix ms, null when decay is disabled. */
    decayLastActiveAt: number | null;
    decayInactiveDays: number;
    recent: ProfileActivityLog[];
}

/** Staff points + support performance — only present for members with a staff record. */
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
    /** Unix ms. */
    createdAt: number;
}

export interface ProfileProjectEntry {
    projectId: string;
    title: string;
    projectType: string;
    likes: number;
    dislikes: number;
    views: number;
    /** Unix ms. */
    createdAt: number;
}

export interface ProfilePunishmentEntry {
    caseId: string;
    type: string;
    reason: string;
    active: boolean;
    appealed: boolean;
    /** Unix ms. */
    createdAt: number;
}

/** Everything the bot's /profile dropdown offers beyond the snapshot, for the Activity's detail sections. */
export interface ProfileDetails {
    activity: ProfileActivityDetails;
    /** Null when the user has never earned staff points (mirrors the bot hiding staff stats for non-staff). */
    staff: ProfileStaffDetails | null;
    notes: ProfileNoteEntry[];
    projects: ProfileProjectEntry[];
    punishments: ProfilePunishmentEntry[];
    /** 0-100 escalation level from the punishment system. */
    punishmentLevel: number;
}
