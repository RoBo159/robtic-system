export const AI_CONFIG = {
    enabled: process.env.AI_ENABLED === "true",
    provider: "groq" as const,
    apiKey: process.env.GROQ_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "llama-3.3-70b-versatile",
    timeoutMs: 5_000,
    minMessageLength: 5,
    confidenceThreshold: 0.6,
    maxPromptLength: 800,
} as const;

export type MessageClassification =
    | "support_reply"
    | "low_effort_reply"
    | "staff_chat"
    | "spam"
    | "conversation_end"
    | "meaningful"
    | "unknown";

export interface AiClassificationResult {
    classification: MessageClassification;
    confidence: number;
    fallback: boolean;
}

export interface AiAnalysisResult {
    meaningful: boolean;
    confidence: number;
    fallback: boolean;
    reason?: string;
}
