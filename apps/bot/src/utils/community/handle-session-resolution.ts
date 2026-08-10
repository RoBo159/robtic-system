import type { Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { SUPPORT_POINTS, SUPPORT_SCORING, SORRY_DM_PROBABILITY, RATING_DM_PROBABILITY } from "@constants";
import { resolveSession } from "../../services/community/support";
import {
    logToChannel,
    dynamicSupportPointsEmbed,
    supportSessionEmbed,
    sorryDmEmbed,
    ratingFeedbackEmbed,
} from "./activity-log";

export async function handleSessionResolution(
    message: Message,
    session: { userMessageId: string; userId: string; claimedBy: string | null; responseTimeMs: number | null },
    guildId: string,
    endingContent: string,
    endedBy: string,
    reason: string,
    client: BotClient,
): Promise<void> {
    const resolved = await resolveSession(session.userMessageId, guildId, endingContent);
    if (!resolved) return;

    Logger.debug(`[activity] Session resolved: staff=${resolved.staffId} points=${resolved.points} quality=${resolved.quality} sentiment=${resolved.sentiment}`, client.botName);

    const responseMs = session.responseTimeMs ?? 0;
    let speedPts = 0;
    if (responseMs > 0) {
        if (responseMs <= SUPPORT_POINTS.fastResponseMs) speedPts = SUPPORT_SCORING.speedFastPoints;
        else if (responseMs <= SUPPORT_POINTS.normalResponseMs) speedPts = SUPPORT_SCORING.speedNormalPoints;
    }
    const qualityPts = resolved.quality === "professional" ? SUPPORT_SCORING.qualityProfessionalPoints
        : resolved.quality === "bad" ? SUPPORT_SCORING.qualityBadPoints
        : resolved.quality === "normal" ? SUPPORT_SCORING.qualityNormalPoints
        : 0;
    const sentimentPts = resolved.sentiment === "negative" ? SUPPORT_SCORING.sentimentNegativePoints : 0;

    await logToChannel(client, "support_points", dynamicSupportPointsEmbed(
        resolved.staffId, resolved.points, speedPts, qualityPts, sentimentPts,
        resolved.quality, resolved.sentiment, responseMs,
    ));
    await logToChannel(client, "support_points", supportSessionEmbed(
        "resolved", session.userId, resolved.staffId, reason,
    ));

    if (resolved.sentiment === "negative" && Math.random() < SORRY_DM_PROBABILITY) {
        try {
            const user = await message.guild!.members.fetch(session.userId).catch(() => null);
            if (user) {
                await user.send({ embeds: [sorryDmEmbed()] }).catch(() => {});
                Logger.debug(`[activity] Sent sorry DM to user ${session.userId}`, client.botName);
            }
        } catch {}
    }

    if (resolved.sentiment !== "negative" && Math.random() < RATING_DM_PROBABILITY) {
        try {
            const user = await message.guild!.members.fetch(session.userId).catch(() => null);
            if (user) {
                await user.send({ embeds: [ratingFeedbackEmbed()] }).catch(() => {});
                Logger.debug(`[activity] Sent rating embed to user ${session.userId}`, client.botName);
            }
        } catch {}
    }
}
