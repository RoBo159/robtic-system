import { COMBO_CONFIG } from "@constants";
import { channelBuffers, channelLastSeen } from "./channel-buffers";

/** Drops detection state for channels that have had no activity in a while — call periodically from the scheduler. */
export function pruneStaleChannelBuffers(now: number = Date.now()): void {
    for (const [channelId, lastSeen] of channelLastSeen) {
        if (now - lastSeen > COMBO_CONFIG.channelBufferTtlMs) {
            channelBuffers.delete(channelId);
            channelLastSeen.delete(channelId);
        }
    }
}
