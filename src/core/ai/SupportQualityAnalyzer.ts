import { AiClient } from "./AiClient";
import { buildSessionQualityPrompt, buildUserFeedbackPrompt, buildStaffChatReminderPrompt } from "./prompts";
import { AI_CONFIG } from "@core/config/aiConfig";
import { Logger } from "@core/libs";

const CTX = "ai:quality";

const NEGATIVE_FEEDBACK_PATTERNS = /(?:\b(worst|useless|terrible|horrible|awful|bad support|hate|don'?t like your support|thank you for nothing|waste of time|no help|didn'?t help)\b|ما استفدت|دعم سيء|ما ساعدتني|اسوأ|بدون فايدة|شكرا على لا شي|ما فادني|سيء جدا|ما عجبني)/i;

const POSITIVE_FEEDBACK_PATTERNS = /(?:\b(great help|amazing support|perfect|excellent|wonderful|appreciate|very helpful|best support)\b|شكرا جزيلا|ممتاز|رائع|الله يجزاك خير|مبدع|احسنت|يعطيك العافية)/i;

export type SessionQuality = "professional" | "normal" | "bad";
export type UserSentiment = "positive" | "negative" | "neutral";

export interface SessionQualityResult {
    quality: SessionQuality;
    confidence: number;
    fallback: boolean;
}

export interface UserSentimentResult {
    sentiment: UserSentiment;
    confidence: number;
    fallback: boolean;
}

export interface StaffChatCheckResult {
    isStaffChat: boolean;
    confidence: number;
    fallback: boolean;
}

export async function analyzeSessionQuality(staffMessages: string[]): Promise<SessionQualityResult> {
    if (staffMessages.length === 0) {
        return { quality: "normal", confidence: 0.5, fallback: true };
    }

    const avgLength = staffMessages.reduce((s, m) => s + m.length, 0) / staffMessages.length;
    if (avgLength < 10 && staffMessages.length <= 2) {
        const result: SessionQualityResult = { quality: "bad", confidence: 0.7, fallback: true };
        Logger.debug(`[quality] Staff msgs avgLen=${avgLength.toFixed(0)}, count=${staffMessages.length} → ${result.quality} (fallback)`, CTX);
        return result;
    }

    if (!AI_CONFIG.enabled) {
        const quality: SessionQuality = avgLength >= 40 ? "professional" : "normal";
        return { quality, confidence: 0.5, fallback: true };
    }

    try {
        const client = AiClient.getInstance();
        const prompt = buildSessionQualityPrompt(staffMessages);
        const raw = await client.generate(prompt, 80, true);
        const parsed = client.parseJsonResponse<{ quality: SessionQuality; confidence: number }>(raw);

        if (parsed && ["professional", "normal", "bad"].includes(parsed.quality)) {
            const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.7;
            const result: SessionQualityResult = {
                quality: parsed.quality,
                confidence: Math.min(Math.max(confidence, 0), 1),
                fallback: false,
            };
            Logger.debug(`[quality] Session quality → ${result.quality} (conf=${result.confidence.toFixed(2)}, ai)`, CTX);
            return result;
        }
    } catch (err) {
        Logger.warn(`[quality] AI quality analysis failed: ${err}`, CTX);
    }

    const quality: SessionQuality = avgLength >= 40 ? "professional" : "normal";
    return { quality, confidence: 0.5, fallback: true };
}

export function ruleBasedSentiment(content: string): UserSentimentResult | null {
    if (NEGATIVE_FEEDBACK_PATTERNS.test(content)) {
        return { sentiment: "negative", confidence: 0.85, fallback: true };
    }
    if (POSITIVE_FEEDBACK_PATTERNS.test(content)) {
        return { sentiment: "positive", confidence: 0.8, fallback: true };
    }
    return null;
}

export async function analyzeUserFeedback(content: string): Promise<UserSentimentResult> {
    const rule = ruleBasedSentiment(content);
    if (rule) {
        Logger.debug(`[quality] User sentiment → ${rule.sentiment} (conf=${rule.confidence.toFixed(2)}, fallback=true)`, CTX);
        return rule;
    }

    if (!AI_CONFIG.enabled || content.trim().length < 5) {
        return { sentiment: "neutral", confidence: 0.5, fallback: true };
    }

    try {
        const client = AiClient.getInstance();
        const prompt = buildUserFeedbackPrompt(content);
        const raw = await client.generate(prompt, 80, true);
        const parsed = client.parseJsonResponse<{ sentiment: UserSentiment; confidence: number }>(raw);

        if (parsed && ["positive", "negative", "neutral"].includes(parsed.sentiment)) {
            const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.7;
            const result: UserSentimentResult = {
                sentiment: parsed.sentiment,
                confidence: Math.min(Math.max(confidence, 0), 1),
                fallback: false,
            };
            Logger.debug(`[quality] User sentiment → ${result.sentiment} (conf=${result.confidence.toFixed(2)}, ai)`, CTX);
            return result;
        }
    } catch (err) {
        Logger.warn(`[quality] AI sentiment analysis failed: ${err}`, CTX);
    }

    return { sentiment: "neutral", confidence: 0.4, fallback: true };
}

export async function detectStaffChat(messages: string[]): Promise<StaffChatCheckResult> {
    if (messages.length < 3) {
        return { isStaffChat: false, confidence: 0.5, fallback: true };
    }

    if (!AI_CONFIG.enabled) {
        return { isStaffChat: false, confidence: 0.3, fallback: true };
    }

    try {
        const client = AiClient.getInstance();
        const prompt = buildStaffChatReminderPrompt(messages);
        const raw = await client.generate(prompt, 80, true);
        const parsed = client.parseJsonResponse<{ isStaffChat: boolean; confidence: number }>(raw);

        if (parsed && typeof parsed.isStaffChat === "boolean") {
            const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.7;
            const result: StaffChatCheckResult = {
                isStaffChat: parsed.isStaffChat,
                confidence: Math.min(Math.max(confidence, 0), 1),
                fallback: false,
            };
            Logger.debug(`[quality] Staff chat detection → isStaffChat=${result.isStaffChat} (conf=${result.confidence.toFixed(2)}, ai)`, CTX);
            return result;
        }
    } catch (err) {
        Logger.warn(`[quality] AI staff chat detection failed: ${err}`, CTX);
    }

    return { isStaffChat: false, confidence: 0.3, fallback: true };
}
