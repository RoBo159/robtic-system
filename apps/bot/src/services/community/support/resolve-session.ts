import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { SUPPORT_POINTS, SUPPORT_SCORING } from "@constants";
import { Logger } from "@logger";

const CTX = "community:support";

export async function resolveSession(
    messageId: string,
    guildId: string,
): Promise<{ points: number; staffId: string } | null> {
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

    const points = speedPoints;

    Logger.debug(
        `Resolving session msg=${messageId}: responseMs=${responseMs ?? "none"} speed=${speedPoints} total=${points} staff=${session.claimedBy}`,
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
            details: `Speed: ${speedPoints}, Response: ${responseMs != null ? Math.round(responseMs / 1000) + "s" : "N/A"}`,
        });
    }

    return { points, staffId: session.claimedBy };
}
