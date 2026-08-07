import {
    MinecraftBridgeEvent,
    type IMinecraftBridgeEvent,
    type MinecraftBridgeDirection,
    type MinecraftBridgeEventType,
} from "@database/models/MinecraftBridgeEvent";

export class MinecraftBridgeRepository {
    static async publish(event: {
        guildId: string;
        direction: MinecraftBridgeDirection;
        type: MinecraftBridgeEventType;
        payload: Record<string, unknown>;
        serverKey?: string | null;
        retentionMs: number;
    }): Promise<IMinecraftBridgeEvent> {
        return MinecraftBridgeEvent.create({
            guildId: event.guildId,
            direction: event.direction,
            type: event.type,
            serverKey: event.serverKey ?? null,
            payload: event.payload,
            expiresAt: new Date(Date.now() + event.retentionMs),
        });
    }

    /**
     * Claims up to `limit` pending events in arrival order. Each row is flipped to consumed by an
     * atomic findOneAndUpdate, so a second consumer draining the same queue never sees it twice.
     */
    static async claimPending(
        guildId: string,
        direction: MinecraftBridgeDirection,
        limit: number,
    ): Promise<IMinecraftBridgeEvent[]> {
        const claimed: IMinecraftBridgeEvent[] = [];

        for (let index = 0; index < limit; index++) {
            const event = await MinecraftBridgeEvent.findOneAndUpdate(
                { guildId, direction, consumed: false },
                { $set: { consumed: true, consumedAt: new Date() } },
                { sort: { createdAt: 1 }, returnDocument: "after" }
            );

            if (!event) break;
            claimed.push(event);
        }

        return claimed;
    }

    static async pendingCount(guildId: string, direction: MinecraftBridgeDirection): Promise<number> {
        return MinecraftBridgeEvent.countDocuments({ guildId, direction, consumed: false });
    }

    /** Guilds with queued work in one direction, so idle guilds cost nothing to poll. */
    static async guildIdsWithPending(direction: MinecraftBridgeDirection): Promise<string[]> {
        return MinecraftBridgeEvent.distinct("guildId", { direction, consumed: false });
    }
}
