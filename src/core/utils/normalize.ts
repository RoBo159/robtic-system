export function normalizeElongated(text: string): string {
    return text.replace(/(.)\1{2,}/g, "$1$1");
}
