import { claimIntrusionCounters } from "./store";

export function resetClaimIntrusion(staffId: string, channelId: string): void {
    claimIntrusionCounters.delete(`${staffId}:${channelId}`);
}
