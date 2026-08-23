import { MinecraftFriendship, friendshipPair, type IMinecraftFriendship } from "@database/models/MinecraftFriendship";
import { MinecraftFriendRequest, type IMinecraftFriendRequest } from "@database/models/MinecraftFriendRequest";

/**
 * Friendships and the requests that create them.
 *
 * Both halves live here because they are one workflow: accepting a request deletes it and creates
 * a friendship, and splitting that across two repositories would let a caller do one without the
 * other.
 */
export class MinecraftFriendRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    // ─── Friendships ──────────────────────────────────────────────────────────────────────────

    /** Every UUID this player is friends with, flattened out of the sorted-pair storage. */
    static async listFriends(uuid: string): Promise<string[]> {
        const key = this.key(uuid);
        const rows = await MinecraftFriendship.find({ $or: [{ uuidLow: key }, { uuidHigh: key }] });
        return rows.map(row => (row.uuidLow === key ? row.uuidHigh : row.uuidLow));
    }

    static async areFriends(a: string, b: string): Promise<boolean> {
        return (await MinecraftFriendship.countDocuments(friendshipPair(a, b))) > 0;
    }

    static async countFriends(uuid: string): Promise<number> {
        const key = this.key(uuid);
        return MinecraftFriendship.countDocuments({ $or: [{ uuidLow: key }, { uuidHigh: key }] });
    }

    /** Idempotent: befriending an existing friend is a no-op rather than a duplicate row. */
    static async befriend(a: string, b: string): Promise<IMinecraftFriendship> {
        const pair = friendshipPair(a, b);
        return MinecraftFriendship.findOneAndUpdate(
            pair,
            { $setOnInsert: pair },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftFriendship>;
    }

    static async unfriend(a: string, b: string): Promise<boolean> {
        const result = await MinecraftFriendship.deleteOne(friendshipPair(a, b));
        return result.deletedCount > 0;
    }

    // ─── Requests ─────────────────────────────────────────────────────────────────────────────

    /** Requests waiting for this player to answer. */
    static async incoming(uuid: string): Promise<IMinecraftFriendRequest[]> {
        return MinecraftFriendRequest.find({ targetUuid: this.key(uuid) }).sort({ createdAt: -1 });
    }

    static async outgoing(uuid: string): Promise<IMinecraftFriendRequest[]> {
        return MinecraftFriendRequest.find({ requesterUuid: this.key(uuid) }).sort({ createdAt: -1 });
    }

    static async findRequest(requesterUuid: string, targetUuid: string): Promise<IMinecraftFriendRequest | null> {
        return MinecraftFriendRequest.findOne({
            requesterUuid: this.key(requesterUuid),
            targetUuid: this.key(targetUuid),
        });
    }

    /** Repeating `/friend add` refreshes the existing request rather than stacking a second one. */
    static async request(input: {
        requesterUuid: string;
        requesterUsername: string;
        targetUuid: string;
    }): Promise<IMinecraftFriendRequest> {
        return MinecraftFriendRequest.findOneAndUpdate(
            { requesterUuid: this.key(input.requesterUuid), targetUuid: this.key(input.targetUuid) },
            { $set: { requesterUsername: input.requesterUsername, createdAt: new Date() } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftFriendRequest>;
    }

    static async removeRequest(requesterUuid: string, targetUuid: string): Promise<boolean> {
        const result = await MinecraftFriendRequest.deleteOne({
            requesterUuid: this.key(requesterUuid),
            targetUuid: this.key(targetUuid),
        });
        return result.deletedCount > 0;
    }

    /** Clears both directions, used when a friendship is formed or somebody is removed. */
    static async clearBetween(a: string, b: string): Promise<void> {
        const [low, high] = [this.key(a), this.key(b)];
        await MinecraftFriendRequest.deleteMany({
            $or: [
                { requesterUuid: low, targetUuid: high },
                { requesterUuid: high, targetUuid: low },
            ],
        });
    }
}
