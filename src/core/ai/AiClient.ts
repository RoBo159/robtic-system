import Groq from "groq-sdk";
import { AI_CONFIG } from "@core/config/aiConfig";
import { Logger } from "@core/libs";

const CTX = "core:ai";

export class AiClient {
    private static instance: AiClient | null = null;
    private groq: Groq;

    private constructor() {
        this.groq = new Groq({ apiKey: AI_CONFIG.apiKey });
    }

    static getInstance(): AiClient {
        if (!AiClient.instance) {
            AiClient.instance = new AiClient();
        }
        return AiClient.instance;
    }

    async generate(prompt: string, maxTokens = 100, jsonMode = false): Promise<string | null> {
        if (!AI_CONFIG.enabled) {
            Logger.debug("AI disabled, skipping generation", CTX);
            return null;
        }

        if (!AI_CONFIG.apiKey) {
            Logger.warn("GROQ_API_KEY not set, skipping AI generation", CTX);
            return null;
        }

        const trimmedPrompt = prompt.slice(0, AI_CONFIG.maxPromptLength);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs);

            const messages: { role: "system" | "user"; content: string }[] = jsonMode
                ? [
                    { role: "system", content: "You are a JSON-only classifier. Always respond with valid raw JSON. No markdown, no code blocks, no extra text." },
                    { role: "user", content: trimmedPrompt },
                ]
                : [{ role: "user", content: trimmedPrompt }];

            const completion = await this.groq.chat.completions.create(
                {
                    model: AI_CONFIG.model,
                    messages,
                    temperature: 0.1,
                    max_tokens: maxTokens,
                    ...(jsonMode && { response_format: { type: "json_object" } }),
                },
                { signal: controller.signal },
            );

            clearTimeout(timeout);

            const content = completion.choices[0]?.message?.content;
            if (!content) {
                Logger.warn("Groq returned empty response", CTX);
                return null;
            }

            Logger.debug(`AI response (${content.length} chars): ${content.slice(0, 80)}`, CTX);
            return content.trim();
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                Logger.warn(`AI request timed out after ${AI_CONFIG.timeoutMs}ms`, CTX);
            } else {
                Logger.warn(`AI request failed: ${err}`, CTX);
            }
            return null;
        }
    }

    parseJsonResponse<T>(raw: string | null): T | null {
        if (!raw) return null;

        try {
            let cleaned = raw.trim();
            const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                cleaned = codeBlockMatch[1].trim();
            }
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            return JSON.parse(jsonMatch[0]) as T;
        } catch {
            Logger.debug(`Failed to parse AI JSON: ${raw?.slice(0, 100)}`, CTX);
            return null;
        }
    }
}
