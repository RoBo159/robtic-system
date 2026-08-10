import { CLAIM_INTRUSION_TIMEOUT_MS } from "@constants";
import { claimIntrusionCounters } from "./store";

export function trackClaimIntrusion(staffId: string, channelId: string): { warned: boolean; shouldDeduct: boolean } {
    const key = `${staffId}:${channelId}`;
    let tracker = claimIntrusionCounters.get(key);

    if (tracker && Date.now() - tracker.startedAt >= CLAIM_INTRUSION_TIMEOUT_MS) {
        claimIntrusionCounters.delete(key);
        tracker = undefined;
    }

    if (!tracker) {
        tracker = { count: 0, warned: false, startedAt: Date.now() };
        claimIntrusionCounters.set(key, tracker);
    }

    tracker.count++;

    if (!tracker.warned) {
        tracker.warned = true;
        return { warned: true, shouldDeduct: false };
    }

    return { warned: false, shouldDeduct: true };
}
