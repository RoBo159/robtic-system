import { DURATION_SHORTHAND_REGEX, DURATION_UNIT_MS, DEFAULT_SECURITY_WINDOW_MS } from "@constants";

export function parseWindowToMs(raw: string): number {
    const value = raw.trim().toLowerCase();
    const match = value.match(DURATION_SHORTHAND_REGEX);
    if (!match) return DEFAULT_SECURITY_WINDOW_MS;

    const amount = Number(match[1]);
    const unit = (match[2] ?? "s") as keyof typeof DURATION_UNIT_MS;

    return amount * DURATION_UNIT_MS[unit];
}
