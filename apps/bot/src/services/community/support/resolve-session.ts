import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { SUPPORT_POINTS, SUPPORT_SCORING } from "@constants";
import { Logger } from "@logger";
import { analyzeSessionQuality, analyzeUserFeedback } from "@core/ai";
import type { SessionQuality, UserSentiment } from "@core/ai";

const CTX = "community:support";

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
        speedPoints = SUPPORT_SCORING.speedFastPoints;
    } else if (responseMs <= SUPPORT_POINTS.normalResponseMs) {
        speedPoints = SUPPORT_SCORING.speedNormalPoints;
    } else {
        speedPoints = 0;
    }

    let qualityPoints = 0;
    let quality: SessionQuality | null = null;
    if (session.staffMessages && session.staffMessages.length > 0) {
        const qualityResult = await analyzeSessionQuality(session.staffMessages);
        quality = qualityResult.quality;
        await SupportSessionRepository.setSessionQuality(messageId, quality);

        if (quality === "professional") qualityPoints = SUPPORT_SCORING.qualityProfessionalPoints;
        else if (quality === "normal") qualityPoints = SUPPORT_SCORING.qualityNormalPoints;
        else if (quality === "bad") qualityPoints = SUPPORT_SCORING.qualityBadPoints;
    }

    let sentimentPoints = 0;
    let sentiment: UserSentiment | null = null;
    if (endingMessageContent && endingMessageContent.trim().length > 0) {
        const sentimentResult = await analyzeUserFeedback(endingMessageContent);
        sentiment = sentimentResult.sentiment;
        await SupportSessionRepository.setUserSentiment(messageId, sentiment);

        if (sentiment === "negative") sentimentPoints = SUPPORT_SCORING.sentimentNegativePoints;
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
