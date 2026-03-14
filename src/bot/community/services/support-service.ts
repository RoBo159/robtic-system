import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { XPSettingsRepository } from "@database/repositories/XPSettingsRepository";
import { SUPPORT_POINTS } from "@core/config";
import { Logger } from "@core/libs";
import { analyzeSessionQuality, analyzeUserFeedback } from "@core/ai";
import type { SessionQuality, UserSentiment } from "@core/ai";

const CTX = "community:support";

export async function isSupportChannel(guildId: string, channelId: string): Promise<boolean> {
    const settings = await XPSettingsRepository.get(guildId);
    if (!settings) return false;
    return settings.supportChannels.includes(channelId);
}

export async function createSession(
    guildId: string,
    channelId: string,
    messageId: string,
    userId: string,
): Promise<boolean> {
    const existing = await SupportSessionRepository.findOpenByUser(channelId, userId);
    if (existing) {
        Logger.debug(`User ${userId} already has open session in ${channelId}, updating timestamp`, CTX);
        await SupportSessionRepository.touchSession(existing.userMessageId);
        return false;
    }

    Logger.debug(`Creating support session: user=${userId} channel=${channelId} msg=${messageId}`, CTX);
    await SupportSessionRepository.create({
        guildId,
        channelId,
        userMessageId: messageId,
        userId,
    });
    return true;
}

const CLAIM_INACTIVE_MS = 600_000; // 10 minutes

export interface ClaimResult {
    claimed: boolean;
    intruding?: { sessionUserId: string; claimedBy: string };
    takeover?: { sessionUserId: string; previousStaff: string };
}

export async function autoClaimSession(
    channelId: string,
    staffId: string,
    guildId: string,
): Promise<ClaimResult> {
    const openSessions = await SupportSessionRepository.findOpen(channelId);
    const result: ClaimResult = { claimed: false };

    for (const session of openSessions) {
        if (!session.claimedBy) {
            const claimResult = await SupportSessionRepository.claim(session.userMessageId, staffId);
            if (claimResult) {
                Logger.debug(`Auto-claimed session msg=${session.userMessageId} by staff=${staffId}`, CTX);
                await ActivityLogRepository.log({
                    guildId,
                    userId: staffId,
                    type: "support_claim",
                    amount: 0,
                    details: `Auto-claimed support session in channel ${channelId}`,
                });
                result.claimed = true;
            }
        } else if (session.claimedBy !== staffId) {
            const lastActivity = session.respondedAt ?? session.claimedAt;
            const inactiveMs = lastActivity ? Date.now() - lastActivity.getTime() : Infinity;

            if (inactiveMs >= CLAIM_INACTIVE_MS) {
                const previousStaff = session.claimedBy;
                const reassigned = await SupportSessionRepository.reassign(session.userMessageId, staffId);
                if (reassigned) {
                    Logger.debug(`Takeover: session msg=${session.userMessageId} reassigned from ${previousStaff} to ${staffId} (inactive ${Math.round(inactiveMs / 1000)}s)`, CTX);
                    await ActivityLogRepository.log({
                        guildId,
                        userId: staffId,
                        type: "support_claim",
                        amount: 0,
                        details: `Took over session from ${previousStaff} (inactive ${Math.round(inactiveMs / 1000)}s) in ${channelId}`,
                    });
                    await ActivityRepository.findOrCreate(previousStaff, guildId, "staff");
                    await ActivityRepository.addSupportPoints(previousStaff, guildId, -1);
                    await ActivityLogRepository.log({
                        guildId,
                        userId: previousStaff,
                        type: "support_penalty",
                        amount: -1,
                        details: `Ignored user in ${channelId}, session taken over by ${staffId}`,
                    });
                    result.claimed = true;
                    result.takeover = { sessionUserId: session.userId, previousStaff };
                }
            } else {
                result.intruding = { sessionUserId: session.userId, claimedBy: session.claimedBy };
            }
        }
    }

    return result;
}

export async function claimSession(
    messageId: string,
    staffId: string,
    guildId: string,
): Promise<boolean> {
    const session = await SupportSessionRepository.claim(messageId, staffId);
    if (!session) {
        Logger.debug(`Claim failed for msg=${messageId} by staff=${staffId} (already claimed or not found)`, CTX);
        return false;
    }

    Logger.debug(`Session claimed: msg=${messageId} by staff=${staffId}`, CTX);
    await ActivityLogRepository.log({
        guildId,
        userId: staffId,
        type: "support_claim",
        amount: 0,
        details: `Claimed support session in channel ${session.channelId}`,
    });

    return true;
}

export async function resolveSession(
    messageId: string,
    guildId: string,
    endingMessageContent?: string,
): Promise<{ points: number; staffId: string; quality: SessionQuality | null; sentiment: UserSentiment | null } | null> {
    const session = await SupportSessionRepository.findByMessage(messageId);
    if (!session || !session.claimedBy || session.resolved) return null;

    let speedPoints: number;
    const responseMs = session.responseTimeMs;

    if (responseMs == null) {
        speedPoints = 0;
    } else if (responseMs <= SUPPORT_POINTS.fastResponseMs) {
        speedPoints = 2;
    } else if (responseMs <= SUPPORT_POINTS.normalResponseMs) {
        speedPoints = 1;
    } else {
        speedPoints = 0;
    }

    let qualityPoints = 0;
    let quality: SessionQuality | null = null;
    if (session.staffMessages && session.staffMessages.length > 0) {
        const qualityResult = await analyzeSessionQuality(session.staffMessages);
        quality = qualityResult.quality;
        await SupportSessionRepository.setSessionQuality(messageId, quality);

        if (quality === "professional") qualityPoints = 2;
        else if (quality === "normal") qualityPoints = 1;
        else if (quality === "bad") qualityPoints = -1;
    }

    let sentimentPoints = 0;
    let sentiment: UserSentiment | null = null;
    if (endingMessageContent && endingMessageContent.trim().length > 0) {
        const sentimentResult = await analyzeUserFeedback(endingMessageContent);
        sentiment = sentimentResult.sentiment;
        await SupportSessionRepository.setUserSentiment(messageId, sentiment);

        if (sentiment === "negative") sentimentPoints = -1;
    }

    const points = speedPoints + qualityPoints + sentimentPoints;

    Logger.debug(
        `Resolving session msg=${messageId}: responseMs=${responseMs ?? "none"} speed=${speedPoints} quality=${qualityPoints}(${quality ?? "N/A"}) sentiment=${sentimentPoints}(${sentiment ?? "N/A"}) total=${points} staff=${session.claimedBy}`,
        CTX,
    );

    await SupportSessionRepository.resolve(messageId, points);

    if (points !== 0) {
        await ActivityRepository.findOrCreate(session.claimedBy, guildId, "staff");
        await ActivityRepository.addSupportPoints(session.claimedBy, guildId, points);

        const logType = points >= 0 ? "support_points" : "support_penalty";
        await ActivityLogRepository.log({
            guildId,
            userId: session.claimedBy,
            type: logType,
            amount: points,
            details: `Speed: ${speedPoints}, Quality: ${quality ?? "N/A"} (${qualityPoints}), Sentiment: ${sentiment ?? "N/A"} (${sentimentPoints}), Response: ${responseMs != null ? Math.round(responseMs / 1000) + "s" : "N/A"}`,
        });
    }

    return { points, staffId: session.claimedBy, quality, sentiment };
}

export async function recordResponse(messageId: string): Promise<void> {
    Logger.debug(`Recording response for session msg=${messageId}`, CTX);
    await SupportSessionRepository.respond(messageId);
}

export async function penalizeAbandon(
    messageId: string,
    guildId: string,
): Promise<void> {
    const session = await SupportSessionRepository.findByMessage(messageId);
    if (!session || !session.claimedBy || session.resolved) return;

    const penalty = SUPPORT_POINTS.claimAbandonPenalty;
    await ActivityRepository.addStaffPenalty(session.claimedBy, guildId, Math.abs(penalty));
    await ActivityRepository.addSupportPoints(session.claimedBy, guildId, penalty);

    await ActivityLogRepository.log({
        guildId,
        userId: session.claimedBy,
        type: "support_penalty",
        amount: penalty,
        details: `Abandoned claimed support session in ${session.channelId}`,
    });
}

const STALE_SESSION_MS = 600_000; // 10 minutes
let staleInterval: ReturnType<typeof setInterval> | null = null;

export async function closeStaleSessions(): Promise<void> {
    const staleSessions = await SupportSessionRepository.findStale(STALE_SESSION_MS);
    for (const session of staleSessions) {
        if (session.claimedBy) {
            await resolveSession(session.userMessageId, session.guildId);
            Logger.debug(`Auto-resolved stale session msg=${session.userMessageId} (claimed by ${session.claimedBy})`, CTX);
        } else {
            await SupportSessionRepository.resolve(session.userMessageId, 0);
            Logger.debug(`Auto-closed stale unclaimed session msg=${session.userMessageId}`, CTX);
        }
    }
}

export function startSessionCleanupScheduler(): void {
    if (staleInterval) return;
    staleInterval = setInterval(() => {
        closeStaleSessions().catch(err =>
            Logger.error(`Session cleanup failed: ${err}`, CTX)
        );
    }, 300_000);
    Logger.info("Support session cleanup scheduler started (every 5min, stale after 10min)", CTX);
}

export function stopSessionCleanupScheduler(): void {
    if (staleInterval) {
        clearInterval(staleInterval);
        staleInterval = null;
    }
}
