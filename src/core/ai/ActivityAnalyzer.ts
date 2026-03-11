import { AiClient } from "./AiClient";
import { buildActivityPrompt, buildStaffActivityPrompt } from "./prompts";
import { AI_CONFIG, type AiAnalysisResult } from "@core/config/aiConfig";
import { Logger } from "@core/libs";
import { normalizeElongated } from "@core/utils/normalize";

const CTX = "ai:activity";

const LOW_EFFORT_EXACT = new Set([
    "ok", "okay", "yes", "no", "yeah", "nah", "sure", "idk",
    "lol", "lmao", "hi", "hey", "hello", "k", "ty", "thx",
    "thanks", "np", "brb", "gg", "rip", "hmm", "hm", "oh", "ah",
    "xd", "omg", "wow", "nice", "cool", "yep", "nope",
    "حسنا", "نعم", "لا", "تمام", "ماشي", "طيب", "اها", "اوك", "هاه", "اه",
]);

function ruleBasedActivity(content: string): AiAnalysisResult {
    const trimmed = content.trim().toLowerCase();

    if (trimmed.length < AI_CONFIG.minMessageLength) {
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

export async function analyzeActivity(content: string): Promise<AiAnalysisResult> {
    const trimmed = normalizeElongated(content.trim());

    if (trimmed.length < AI_CONFIG.minMessageLength) {
        const result: AiAnalysisResult = { meaningful: false, confidence: 0.95, fallback: true, reason: "below min length" };
        Logger.debug(`[activity] "${trimmed.slice(0, 20)}" → meaningful=${result.meaningful} (conf=${result.confidence.toFixed(2)}, fallback=true, reason=${result.reason})`, CTX);
        return result;
    }

    const ruleResult = ruleBasedActivity(content);
    if (ruleResult.confidence >= 0.8) {
        Logger.debug(`[activity] "${trimmed.slice(0, 40)}" → meaningful=${ruleResult.meaningful} (conf=${ruleResult.confidence.toFixed(2)}, fallback=true, reason=${ruleResult.reason})`, CTX);
        return ruleResult;
    }

    if (!AI_CONFIG.enabled) {
        Logger.debug(`[activity] "${trimmed.slice(0, 40)}" → meaningful=${ruleResult.meaningful} (conf=${ruleResult.confidence.toFixed(2)}, fallback=true, reason=AI disabled)`, CTX);
        return ruleResult;
    }

    try {
        const client = AiClient.getInstance();
        const prompt = buildActivityPrompt(content);
        const raw = await client.generate(prompt, 60);
        const parsed = client.parseJsonResponse<{
            meaningful: boolean;
            confidence: number;
            reason?: string;
        }>(raw);

        if (parsed && typeof parsed.meaningful === "boolean" && typeof parsed.confidence === "number") {
            const result: AiAnalysisResult = {
                meaningful: parsed.meaningful,
                confidence: Math.min(Math.max(parsed.confidence, 0), 1),
                fallback: false,
                reason: parsed.reason,
            };
            Logger.debug(
                `[activity] "${trimmed.slice(0, 40)}" → meaningful=${result.meaningful} (conf=${result.confidence.toFixed(2)}, fallback=false, ai, reason=${result.reason ?? "none"})`,
                CTX,
            );
            return result;
        }

        Logger.debug(`[activity] AI returned invalid format for "${trimmed.slice(0, 40)}", falling back to rules`, CTX);
    } catch (err) {
        Logger.warn(`[activity] AI failed for "${trimmed.slice(0, 40)}": ${err}`, CTX);
    }

    Logger.debug(`[activity] "${trimmed.slice(0, 40)}" → meaningful=${ruleResult.meaningful} (conf=${ruleResult.confidence.toFixed(2)}, fallback=true, reason=AI error)`, CTX);
    return ruleResult;
}

export async function analyzeStaffActivity(
    content: string,
    channelType: "public" | "staff",
): Promise<AiAnalysisResult> {
    const trimmed = normalizeElongated(content.trim());

    if (trimmed.length < AI_CONFIG.minMessageLength) {
        const result: AiAnalysisResult = { meaningful: false, confidence: 0.95, fallback: true, reason: "below min length" };
        Logger.debug(`[staff-activity] (${channelType}) "${trimmed.slice(0, 20)}" → meaningful=${result.meaningful} (conf=${result.confidence.toFixed(2)}, fallback=true, reason=${result.reason})`, CTX);
        return result;
    }

    const ruleResult = ruleBasedActivity(content);
    if (ruleResult.confidence >= 0.8) {
        Logger.debug(`[staff-activity] (${channelType}) "${trimmed.slice(0, 40)}" → meaningful=${ruleResult.meaningful} (conf=${ruleResult.confidence.toFixed(2)}, fallback=true, reason=${ruleResult.reason})`, CTX);
        return ruleResult;
    }

    if (!AI_CONFIG.enabled) {
        Logger.debug(`[staff-activity] (${channelType}) "${trimmed.slice(0, 40)}" → meaningful=${ruleResult.meaningful} (conf=${ruleResult.confidence.toFixed(2)}, fallback=true, reason=AI disabled)`, CTX);
        return ruleResult;
    }

    try {
        const client = AiClient.getInstance();
        const prompt = buildStaffActivityPrompt(content, channelType);
        const raw = await client.generate(prompt, 60);
        const parsed = client.parseJsonResponse<{
            meaningful: boolean;
            confidence: number;
        }>(raw);

        if (parsed && typeof parsed.meaningful === "boolean" && typeof parsed.confidence === "number") {
            const result: AiAnalysisResult = {
                meaningful: parsed.meaningful,
                confidence: Math.min(Math.max(parsed.confidence, 0), 1),
                fallback: false,
            };
            Logger.debug(
                `[staff-activity] (${channelType}) "${trimmed.slice(0, 40)}" → meaningful=${result.meaningful} (conf=${result.confidence.toFixed(2)}, fallback=false, ai)`,
                CTX,
            );
            return result;
        }

        Logger.debug(`[staff-activity] AI returned invalid format for "${trimmed.slice(0, 40)}"`, CTX);
    } catch (err) {
        Logger.warn(`[staff-activity] AI failed for "${trimmed.slice(0, 40)}": ${err}`, CTX);
    }

    Logger.debug(`[staff-activity] (${channelType}) "${trimmed.slice(0, 40)}" → meaningful=${ruleResult.meaningful} (conf=${ruleResult.confidence.toFixed(2)}, fallback=true, reason=AI error)`, CTX);
    return ruleResult;
}
