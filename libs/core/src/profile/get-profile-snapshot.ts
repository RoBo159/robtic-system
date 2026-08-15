import type { ProfileSnapshot } from "@typings/profile";
import {
    ActivityRepository,
    CoinsRepository,
    StreakRepository,
    ComboRepository,
    ComboUserStatsRepository,
    UserRepository,
    VoiceRepository,
    PointsRepository,
} from "@database/repositories";
import { calculateLevel, xpForLevel } from "@core/xp";
import { levelForScore } from "@core/combo/level-for-score";
import { favoritePartnerWeight } from "@core/combo/favorite-partner-weight";
import { nextClaimAt } from "@core/streak/next-claim-at";
import { streakExpiresAt } from "@core/streak/streak-expires-at";
import { getProfileBadges } from "./get-profile-badges";

interface SnapshotInput {
    guildId: string;
    /** Whose profile to read. */
    targetId: string;
    /** Who is asking — controls the privacy gate. */
    viewerId: string;
    username: string;
    avatarUrl?: string | null;
}

/**
 * Single source of the profile view for every surface (bot embed, Activity, future dashboard).
 * Reads repositories directly so it stays free of any discord.js/interaction coupling.
 */
export async function getProfileSnapshot(input: SnapshotInput): Promise<ProfileSnapshot> {
    const { guildId, targetId, viewerId, username } = input;
    const isSelf = targetId === viewerId;

    const isPrivate = !isSelf && await UserRepository.getPrivateProfile(targetId);
    const displayName = await UserRepository.getDisplayName(targetId) ?? username;
    const customization = await UserRepository.getCustomization(targetId);
    const coinRecord = await CoinsRepository.get(guildId, targetId);

    const xpRecord = await ActivityRepository.findOrCreate(targetId, guildId, username);
    const level = calculateLevel(xpRecord.totalXP);
    const levelFloor = xpForLevel(level);
    const progress = xpRecord.totalXP - levelFloor;
    const needed = xpForLevel(level + 1) - levelFloor;
    const rank = await ActivityRepository.getRank(targetId, guildId);

    const streakRecord = await StreakRepository.findOrCreate(targetId, guildId, username);
    const streakRank = await StreakRepository.getRank(targetId, guildId);
    const streakBestRank = await StreakRepository.getBestRank(targetId, guildId);

    const activePairs = await ComboRepository.findActiveForUser(guildId, targetId);
    const bestActive = activePairs.length
        ? activePairs.reduce((a, b) => (a.currentScore >= b.currentScore ? a : b))
        : null;
    const activePartnerId = bestActive
        ? (bestActive.userLowId === targetId ? bestActive.userHighId : bestActive.userLowId)
        : null;

    // Absent records are normal — a member who has never joined voice or earned a point has none.
    const voiceStat = await VoiceRepository.getStat(guildId, targetId);
    const voiceRank = voiceStat ? await VoiceRepository.getRankByActiveTime(guildId, targetId) : 0;

    const pointRecord = await PointsRepository.get(guildId, targetId);
    const pointRank = pointRecord ? await PointsRepository.getRank(guildId, targetId) : 0;

    const comboStats = await ComboUserStatsRepository.get(guildId, targetId);
    const favorite = comboStats?.partners?.length
        ? [...comboStats.partners].sort((a, b) => favoritePartnerWeight(b) - favoritePartnerWeight(a))[0]
        : null;

    return {
        discordId: targetId,
        username,
        displayName,
        avatarUrl: input.avatarUrl ?? null,
        isPrivate,
        isSelf,
        customization: {
            color: customization.profileColor,
            textColor: customization.textColor,
            bannerUrl: customization.bannerUrl,
            bio: customization.bio,
            template: customization.profileTemplate,
        },
        coins: coinRecord?.coins ?? 0,
        badges: await getProfileBadges(guildId, targetId, streakRecord.currentStreak),
        xp: {
            totalXP: xpRecord.totalXP,
            level,
            progress,
            needed,
            rank,
            messageCount: xpRecord.messageCount,
        },
        streak: {
            current: streakRecord.currentStreak,
            best: streakRecord.bestStreak,
            active: streakRecord.active,
            rank: streakRank,
            bestRank: streakBestRank,
            nextClaimMs: streakRecord.active
                ? Math.max(0, nextClaimAt(streakRecord.lastIncrement).getTime() - Date.now())
                : 0,
            expiresInMs: streakRecord.active
                ? Math.max(0, streakExpiresAt(streakRecord.lastIncrement).getTime() - Date.now())
                : null,
        },
        combo: {
            activeScore: bestActive?.currentScore ?? null,
            activePartnerId,
            activeLevel: bestActive ? levelForScore(bestActive.currentScore) : null,
            bestScore: comboStats?.bestComboScore ?? 0,
            totalConversations: comboStats?.totalConversations ?? 0,
            favoritePartnerId: favorite?.partnerId ?? null,
        },
        voice: {
            totalConnectedSeconds: voiceStat?.totalConnectedSeconds ?? 0,
            totalActiveSeconds: voiceStat?.totalActiveSeconds ?? 0,
            totalXpEarned: voiceStat?.totalXpEarned ?? 0,
            sessionCount: voiceStat?.sessionCount ?? 0,
            longestSessionSeconds: voiceStat?.longestSessionSeconds ?? 0,
            averageSessionSeconds: voiceStat?.sessionCount
                ? Math.round(voiceStat.totalActiveSeconds / voiceStat.sessionCount)
                : 0,
            rank: voiceRank,
            lastSeenAt: voiceStat?.lastSeenAt?.getTime() ?? null,
        },
        points: {
            points: pointRecord?.points ?? 0,
            lifetimePoints: pointRecord?.lifetimePoints ?? 0,
            rc: pointRecord?.rc ?? 0,
            rank: pointRank,
        },
    };
}
