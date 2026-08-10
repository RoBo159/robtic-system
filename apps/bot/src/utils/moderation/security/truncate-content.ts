import { SECURITY_CONTENT_TRUNCATE, SECURITY_MESSAGES } from "@constants";

export function truncateContent(content: string, size: number = SECURITY_CONTENT_TRUNCATE.default): string {
    if (!content) return SECURITY_MESSAGES.emptyContent;
    if (content.length <= size) return content;
    return `${content.slice(0, size)}...`;
}
