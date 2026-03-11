import { classifyMessage } from "./MessageClassifier";
import type { AiClassificationResult } from "@core/config/aiConfig";
import { Logger } from "@core/libs";

const CTX = "ai:support";

export interface SupportAnalysis {
    isMeaningfulReply: boolean;
    isConversationEnd: boolean;
    classification: AiClassificationResult;
}

export async function analyzeSupportMessage(
    content: string,
    hasReference: boolean,
): Promise<SupportAnalysis> {
    const classification = await classifyMessage(content, hasReference);

    const isMeaningfulReply = classification.classification === "support_reply"
        && classification.confidence >= 0.5;

    const isConversationEnd = classification.classification === "conversation_end"
        && classification.confidence >= 0.5;

    Logger.debug(
        `Support analysis: meaningful=${isMeaningfulReply} end=${isConversationEnd} ` +
        `class=${classification.classification} conf=${classification.confidence.toFixed(2)} ` +
        `fallback=${classification.fallback}`,
        CTX,
    );

    return { isMeaningfulReply, isConversationEnd, classification };
}
