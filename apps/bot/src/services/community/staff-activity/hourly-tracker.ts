import { STAFF_HOURLY_RESET_MS } from "@constants";

const hourlyTracker = new Map<string, { public: number; staff: number; resetAt: number }>();

export function getTracker(userId: string): { public: number; staff: number; resetAt: number } {
    const now = Date.now();
    let tracker = hourlyTracker.get(userId);
    if (!tracker || now >= tracker.resetAt) {
        tracker = { public: 0, staff: 0, resetAt: now + STAFF_HOURLY_RESET_MS };
        hourlyTracker.set(userId, tracker);
    }
    return tracker;
}
