import type { Lang } from "@typings/lang";
import messages from "@bot/utils/lang/messages.json";

export function t(path: string, lang: Lang, vars?: Record<string, string>): string {
    const keys = path.split(".");
    let value: unknown = (messages as Record<string, unknown>)[lang];

    for (const k of keys) {
        if (value && typeof value === "object") {
            value = (value as Record<string, unknown>)[k];
        } else {
            return path;
        }
    }

    if (typeof value !== "string") return path;

    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            value = (value as string).replaceAll(`{${k}}`, v);
        }
    }

    return value as string;
}
