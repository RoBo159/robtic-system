import { PROJECT_TRUNCATE } from "@constants";

export function truncate(text: string, max: number = PROJECT_TRUNCATE.default): string {
    if (!text) return "";
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3))}...`;
}
