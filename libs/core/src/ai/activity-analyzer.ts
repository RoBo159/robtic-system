import type { AiAnalysisResult } from "@typings/ai";
import { Logger } from "@logger";
import { normalizeElongated } from "@utils";

const CTX = "activity";

/** Below this length a message is never worth XP, regardless of what it says. */
const MIN_MESSAGE_LENGTH = 5;

const LOW_EFFORT_EXACT = new Set([
    "ok", "okay", "yes", "no", "yeah", "nah", "sure", "idk",
    "lol", "lmao", "hi", "hey", "hello", "k", "ty", "thx",
    "thanks", "np", "brb", "gg", "rip", "hmm", "hm", "oh", "ah",
    "xd", "omg", "wow", "nice", "cool", "yep", "nope",
    "حسنا", "نعم", "لا", "تمام", "ماشي", "طيب", "اها", "اوك", "هاه", "اه",
]);

function ruleBasedActivity(content: string): AiAnalysisResult {
    const trimmed = content.trim().toLowerCase();

    if (trimmed.length < MIN_MESSAGE_LENGTH) {
        return { meaningful: false, confidence: 0.9, fallback: true, reason: "too short" };
    }

    if (LOW_EFFORT_EXACT.has(trimmed)) {
        return { meaningful: false, confidence: 0.85, fallback: true, reason: "low effort phrase" };
    }

    const wordCount = trimmed.split(/\s+/).length;

    if (wordCount < 3) {
        return { meaningful: false, confidence: 0.8, fallback: true, reason: "fewer than 3 words" };
    }

    if (wordCount >= 6) {
        return { meaningful: true, confidence: 0.8, fallback: true, reason: "6+ words" };
    }

    if (trimmed.length >= 15) {
        return { meaningful: true, confidence: 0.6, fallback: true, reason: "sufficient length" };
    }

    return { meaningful: true, confidence: 0.4, fallback: true, reason: "default allow" };
}

export function analyzeActivity(content: string): AiAnalysisResult {
    const trimmed = normalizeElongated(content.trim());

    if (trimmed.length < MIN_MESSAGE_LENGTH) {
        const result: AiAnalysisResult = { meaningful: false, confidence: 0.95, fallback: true, reason: "below min length" };
        Logger.debug(`[activity] "${trimmed.slice(0, 20)}" → meaningful=${result.meaningful} (conf=${result.confidence.toFixed(2)}, reason=${result.reason})`, CTX);
        return result;
    }

    const result = ruleBasedActivity(content);
    Logger.debug(`[activity] "${trimmed.slice(0, 40)}" → meaningful=${result.meaningful} (conf=${result.confidence.toFixed(2)}, reason=${result.reason})`, CTX);
    return result;
}
