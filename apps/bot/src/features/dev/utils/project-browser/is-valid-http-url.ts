export function isValidHttpUrl(raw?: string): raw is string {
    if (!raw) return false;

    try {
        const parsed = new URL(raw);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}
