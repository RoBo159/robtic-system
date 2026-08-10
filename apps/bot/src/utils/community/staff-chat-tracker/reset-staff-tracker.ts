import { staffChatCounters } from "./store";

export function resetStaffTracker(channelId: string): void {
    staffChatCounters.delete(channelId);
}
