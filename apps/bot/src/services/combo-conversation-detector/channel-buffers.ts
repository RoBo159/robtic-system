import { COMBO_CONFIG } from "@constants";

export interface RecentMessage {
    authorId: string;
    timestamp: number;
}

/**
 * Per-channel ring buffers of recent message authors, used purely for in-memory alternation/recency
 * signals. Bounded in size and pruned by idle time (see pruneStaleChannelBuffers) so this never grows
 * unbounded — safe for large servers and for sharding, since a guild's channels are always owned by
 * exactly one shard/process.
 */
export const channelBuffers = new Map<string, RecentMessage[]>();
export const channelLastSeen = new Map<string, number>();

export function getBuffer(channelId: string): RecentMessage[] {
    return channelBuffers.get(channelId) ?? [];
}

export function pushMessage(channelId: string, entry: RecentMessage): void {
    const buffer = channelBuffers.get(channelId) ?? [];
    buffer.push(entry);
    if (buffer.length > COMBO_CONFIG.recentBufferSize) buffer.shift();
    channelBuffers.set(channelId, buffer);
    channelLastSeen.set(channelId, entry.timestamp);
}
