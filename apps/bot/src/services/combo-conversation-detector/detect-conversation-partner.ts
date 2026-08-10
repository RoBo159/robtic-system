import type { Message } from "discord.js";
import { COMBO_CONFIG, COMBO_DETECTION_WEIGHTS, COMBO_DETECTION_RECENCY_TIERS } from "@constants";
import { getBuffer, pushMessage } from "./channel-buffers";

export interface ConversationDetection {
    partnerId: string;
    confidence: number;
}

export interface ActivePartnerInfo {
    partnerId: string;
    score: number;
}

function recencyWeightFor(elapsed: number): number {
    if (elapsed <= COMBO_DETECTION_RECENCY_TIERS.fast) return COMBO_DETECTION_WEIGHTS.recencyUnder20s;
    if (elapsed <= COMBO_DETECTION_RECENCY_TIERS.medium) return COMBO_DETECTION_WEIGHTS.recencyUnder60s;
    if (elapsed <= COMBO_DETECTION_RECENCY_TIERS.slow) return COMBO_DETECTION_WEIGHTS.recencyUnder120s;
    return 0;
}

/**
 * Infers who a message's author is most likely conversing with, using a weighted combination of
 * signals: reply, mention, alternation/recency, and continuity with an existing active combo
 * (weighted up further by that combo's current score). Returns null when no candidate clears the
 * minimum confidence threshold, meaning the message doesn't count as a conversational interaction
 * for combo purposes.
 */
export function detectConversationPartner(
    message: Message,
    getActivePartner: (userId: string) => ActivePartnerInfo | null,
): ConversationDetection | null {
    const channelId = message.channel.id;
    const authorId = message.author.id;
    const now = message.createdTimestamp || Date.now();
    const buffer = getBuffer(channelId);

    const candidates = new Map<string, number>();
    const addSignal = (id: string | null | undefined, weight: number): void => {
        if (!id || id === authorId || weight <= 0) return;
        candidates.set(id, (candidates.get(id) ?? 0) + weight);
    };

    addSignal(message.mentions.repliedUser?.id ?? null, COMBO_DETECTION_WEIGHTS.reply);

    for (const user of message.mentions.users.values()) {
        addSignal(user.id, COMBO_DETECTION_WEIGHTS.mention);
    }

    for (let i = buffer.length - 1; i >= 0; i--) {
        const candidate = buffer[i];
        if (candidate.authorId === authorId) continue;
        const elapsed = now - candidate.timestamp;
        if (elapsed > COMBO_CONFIG.detectionWindowMs) break;
        addSignal(candidate.authorId, recencyWeightFor(elapsed));
        break;
    }

    // Continuity bias toward the partner the author is already in an active combo with — an ongoing
    // conversation should reliably keep scoring on its own, not depend on landing a fast reply every
    // time — scaled up further the stronger that existing conversation already is.
    const activePartner = getActivePartner(authorId);
    if (activePartner) {
        const scoreWeight = Math.min(activePartner.score / COMBO_DETECTION_WEIGHTS.continuityScoreCeiling, 1)
            * COMBO_DETECTION_WEIGHTS.continuityScoreMax;
        addSignal(activePartner.partnerId, COMBO_DETECTION_WEIGHTS.continuityBase + scoreWeight);
    }

    pushMessage(channelId, { authorId, timestamp: now });

    let bestId: string | null = null;
    let bestScore = 0;
    for (const [id, score] of candidates) {
        if (score > bestScore) {
            bestId = id;
            bestScore = score;
        }
    }

    if (!bestId || bestScore < COMBO_CONFIG.detectionConfidenceThreshold) return null;
    return { partnerId: bestId, confidence: Math.min(1, bestScore) };
}
