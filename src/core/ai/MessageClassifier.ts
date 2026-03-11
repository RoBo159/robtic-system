import { AiClient } from "./AiClient";
import { buildSupportClassificationPrompt } from "./prompts";
import { AI_CONFIG, type AiClassificationResult, type MessageClassification } from "@core/config/aiConfig";
import { Logger } from "@core/libs";
import { normalizeElongated } from "@core/utils/normalize";

const CTX = "ai:classifier";

const LOW_EFFORT_PATTERNS = /^(ok|okay|yes|no|yeah|nah|sure|idk|lol|lmao|hi|hey|k|np|brb|gg|rip|hmm|hm|oh|ah|xd|omg|wow|nice|cool|yep|nope|حسنا|نعم|لا|تمام|ماشي|طيب|اها|اوك|هاه|اه)$/i;

const CONVERSATION_END_PATTERNS = /(?:\b(thanks|thank you|ty|thx|solved|fixed|that worked|problem solved|issue resolved|all good|got it working|works now|that helped|got it|nvm|nevermind)\b|شكرا|مشكور|شكرا لك|تم الحل|انحلت|اشتغلت|الحمدلله|تم حلها|انحلت المشكلة|الله يعطيك العافية)/i;

const SUPPORT_HELP_PATTERNS = /(?:\b(help|try|check|restart|update|send|share|provide|explain|look at|make sure|can you|could you|please|let me know|what error|what happens|have you tried)\b|ساعد|مساعدة|جرب|حاول|ارسل|تأكد|ممكن|المشكلة|مشكلة|ماهي|ماهو|وش المشكل|ايش|كيف|اعادة|شرح|وضح)/i;

function ruleBasedClassify(content: string, hasReference: boolean): AiClassificationResult {
    const trimmed = content.trim().toLowerCase();

    if (CONVERSATION_END_PATTERNS.test(trimmed)) {
        return { classification: "conversation_end", confidence: 0.85, fallback: true };
    }

    if (LOW_EFFORT_PATTERNS.test(trimmed)) {
        return { classification: "low_effort_reply", confidence: 0.9, fallback: true };
    }

    const wordCount = trimmed.split(/\s+/).length;

    if (wordCount >= 3 && SUPPORT_HELP_PATTERNS.test(trimmed)) {
        return { classification: "support_reply", confidence: 0.8, fallback: true };
    }

    if (hasReference && content.length > 20) {
        return { classification: "support_reply", confidence: 0.5, fallback: true };
    }

    return { classification: "unknown", confidence: 0.3, fallback: true };
}

export async function classifyMessage(
    content: string,
    hasReference: boolean,
): Promise<AiClassificationResult> {
    const trimmed = normalizeElongated(content.trim());

    if (trimmed.length < 4) {
        const result: AiClassificationResult = { classification: "low_effort_reply", confidence: 0.95, fallback: true };
        Logger.debug(`[classifier] "${trimmed.slice(0, 20)}" → ${result.classification} (conf=${result.confidence.toFixed(2)}, fallback=true, reason=too short)`, CTX);
        return result;
    }

    if (CONVERSATION_END_PATTERNS.test(trimmed.toLowerCase())) {
        const result: AiClassificationResult = { classification: "conversation_end", confidence: 0.9, fallback: true };
        Logger.debug(`[classifier] "${trimmed.slice(0, 40)}" → ${result.classification} (conf=${result.confidence.toFixed(2)}, fallback=true, reason=end phrase matched)`, CTX);
        return result;
    }

    if (LOW_EFFORT_PATTERNS.test(trimmed.toLowerCase())) {
        const result: AiClassificationResult = { classification: "low_effort_reply", confidence: 0.9, fallback: true };
        Logger.debug(`[classifier] "${trimmed.slice(0, 40)}" → ${result.classification} (conf=${result.confidence.toFixed(2)}, fallback=true, reason=low effort phrase)`, CTX);
        return result;
    }

    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount >= 3 && SUPPORT_HELP_PATTERNS.test(trimmed)) {
        const result: AiClassificationResult = { classification: "support_reply", confidence: 0.85, fallback: true };
        Logger.debug(`[classifier] "${trimmed.slice(0, 40)}" → ${result.classification} (conf=${result.confidence.toFixed(2)}, fallback=true, reason=help phrase with ${wordCount} words)`, CTX);
        return result;
    }

    if (!AI_CONFIG.enabled || trimmed.length < AI_CONFIG.minMessageLength) {
        const result = ruleBasedClassify(content, hasReference);
        Logger.debug(`[classifier] "${trimmed.slice(0, 40)}" → ${result.classification} (conf=${result.confidence.toFixed(2)}, fallback=true, reason=AI disabled or too short)`, CTX);
        return result;
    }

    try {
        const client = AiClient.getInstance();
        const prompt = buildSupportClassificationPrompt(content, hasReference);
        const raw = await client.generate(prompt, 60);
        const parsed = client.parseJsonResponse<{
            classification: MessageClassification;
            confidence: number;
        }>(raw);

        if (parsed && parsed.classification && typeof parsed.confidence === "number") {
            const result: AiClassificationResult = {
                classification: parsed.classification,
                confidence: Math.min(Math.max(parsed.confidence, 0), 1),
                fallback: false,
            };
            Logger.debug(
                `[classifier] "${trimmed.slice(0, 40)}" → ${result.classification} (conf=${result.confidence.toFixed(2)}, fallback=false, ai)`,
                CTX,
            );
            return result;
        }

        Logger.debug(`[classifier] AI returned invalid format for "${trimmed.slice(0, 40)}", falling back to rules`, CTX);
    } catch (err) {
        Logger.warn(`[classifier] AI failed for "${trimmed.slice(0, 40)}": ${err}`, CTX);
    }

    const fallback = ruleBasedClassify(content, hasReference);
    Logger.debug(`[classifier] "${trimmed.slice(0, 40)}" → ${fallback.classification} (conf=${fallback.confidence.toFixed(2)}, fallback=true, reason=AI error)`, CTX);
    return fallback;
}
