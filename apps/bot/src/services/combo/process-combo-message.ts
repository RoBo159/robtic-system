import type { Message } from "discord.js";
import { ComboRepository, PunishmentRepository } from "@database/repositories";
import { COMBO_CONFIG, WHITESPACE_SPLIT_REGEX } from "@constants";
import { isAcceptableMessage } from "@utils";
import { detectConversationPartner } from "../combo-conversation-detector";
import { computeHeat } from "../combo-heat";
import { checkLiveRecords } from "../combo-records";
import { getCachedPartner, cachePartners } from "./active-partner-cache";
import { isStale } from "./is-stale";
import { getScoreRange } from "./score-range-cache";
import { finalizeCombo } from "./finalize-combo";
import { awardComboCoin } from "@core/coins";

export async function processComboMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot || message.webhookId) return;

    const guildId = message.guild.id;
    const authorId = message.author.id;
    const now = message.createdTimestamp || Date.now();

    const detection = detectConversationPartner(message, (userId) => getCachedPartner(guildId, userId));
    if (!detection || detection.partnerId === authorId) return;

    const { partnerId, confidence } = detection;

    let pair = await ComboRepository.findOrCreate(guildId, authorId, partnerId);

    if (isStale(pair, now)) {
        await finalizeCombo(pair);
        const restarted = await ComboRepository.restart(guildId, authorId, partnerId, new Date(now));
        if (!restarted) return;
        pair = restarted;
    }

    const content = message.content.trim();
    if (!isAcceptableMessage(content, COMBO_CONFIG.minMessageLength)) {
        // Presence still counts for alternation/continuity, but low-quality messages earn no score.
        cachePartners(guildId, authorId, partnerId, pair.currentScore);
        return;
    }

    const elapsedSinceLast = pair.messages === 0 ? 0 : now - pair.lastMessageAt.getTime();
    const alternating = pair.lastMessageBy !== "" && pair.lastMessageBy !== authorId;
    const heat = computeHeat(pair.heat, elapsedSinceLast, alternating, confidence);
    const { min: minScore, max: maxScore } = await getScoreRange(guildId);
    let scoreGain = Math.round(minScore + (maxScore - minScore) * confidence);

    // A high punishment level makes it harder (not impossible) for that user to grow shared combo score.
    const punishmentLevel = await PunishmentRepository.getPunishmentLevel(authorId);
    if (punishmentLevel >= COMBO_CONFIG.punishmentGateThreshold) {
        scoreGain = Math.max(1, Math.round(scoreGain * COMBO_CONFIG.punishmentGateMultiplier));
    }

    const durationDelta = Math.min(elapsedSinceLast, COMBO_CONFIG.expireMs);
    const wordCount = content.split(WHITESPACE_SPLIT_REGEX).filter(Boolean).length;
    const characterCount = content.length;

    const updated = await ComboRepository.applyMessage(
        guildId, authorId, partnerId, authorId, scoreGain, heat, durationDelta, wordCount, characterCount, new Date(now),
    );
    if (!updated) return;

    cachePartners(guildId, authorId, partnerId, updated.currentScore);
    await awardComboCoin(guildId, authorId, message.author.username, scoreGain);
    await checkLiveRecords(guildId, updated, updated.userLowId, updated.userHighId);
}
