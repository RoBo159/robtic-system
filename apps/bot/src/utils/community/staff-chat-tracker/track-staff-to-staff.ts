import { STAFF_CHAT_SESSION_TIMEOUT_MS, STAFF_CHAT_WARNING_THRESHOLD } from "@constants";
import { Logger } from "@logger";
import { staffChatCounters } from "./store";

export function trackStaffToStaff(channelId: string, staffId: string): { reachedThreshold: boolean; count: number; warned: boolean } {
    let tracker = staffChatCounters.get(channelId);

    if (tracker && Date.now() - tracker.startedAt >= STAFF_CHAT_SESSION_TIMEOUT_MS) {
        Logger.debug(`[activity:track] Staff tracker expired for channelId=${channelId}, resetting`, "BotClient");
        staffChatCounters.delete(channelId);
        tracker = undefined;
    }

    Logger.debug(`[activity:track] Tracking staff message for staffId=${staffId} in channelId=${channelId}. Current tracker: ${tracker ? `count=${tracker.count}, warned=${tracker.warned}, staffIds=[${[...tracker.staffIds].join(", ")}]` : "none"}`, "BotClient");
    if (!tracker) {
        tracker = { staffIds: new Set(), count: 0, warned: false, startedAt: Date.now() };
        Logger.debug(`[activity:track] Initializing staff tracker for channelId=${channelId}`, "BotClient");
        staffChatCounters.set(channelId, tracker);
    }

    Logger.debug(`[activity:track] Adding staffId=${staffId} to tracker for channelId=${channelId}`, "BotClient");
    tracker.staffIds.add(staffId);
    tracker.count++;
    const reachedThreshold = tracker.staffIds.size >= 2 && tracker.count >= STAFF_CHAT_WARNING_THRESHOLD;
    return { reachedThreshold, count: tracker.count, warned: tracker.warned };
}
