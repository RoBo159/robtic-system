import {
    MinecraftPlayerSession,
    type IMinecraftPlayerSession,
} from "@database/models/MinecraftPlayerSession";

/**
 * Login sessions.
 *
 * Every read compares `expiresAt` in the query rather than trusting the TTL index to have run.
 * MongoDB's TTL monitor sweeps about once a minute, so an expired row can still be present — and a
 * session that is honoured for a minute after it should have ended is exactly the bug the expiry
 * exists to prevent. The index reclaims space; these filters decide access.
 */
export class MinecraftPlayerSessionRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    static async create(input: {
        guildId: string;
        sessionId: string;
        minecraftUuid: string;
        discordId: string;
        serverKey?: string;
        ipHash?: string;
        expiresAt: Date;
    }): Promise<IMinecraftPlayerSession> {
        return MinecraftPlayerSession.create({
            guildId: input.guildId,
            sessionId: input.sessionId,
            minecraftUuid: this.key(input.minecraftUuid),
            discordId: input.discordId,
            serverKey: input.serverKey,
            ipHash: input.ipHash,
            expiresAt: input.expiresAt,
            lastLoginAt: new Date(),
        });
    }

    /**
     * Accepts the newest live session opened from this address, without needing its id.
     *
     * <h2>Why the join path resolves by address rather than by session id</h2>
     *
     * A session id would have to be remembered by the game server between visits, in a file — and
     * each server in a network would keep its own, so a player who logged in on survival would be
     * asked for their password again the moment they hopped to the lobby. The whole point of a
     * network-wide session is that it is network-wide.
     *
     * Resolving by address instead costs nothing in security, because the address was already the
     * only thing making a session meaningful: the id is held by the server, not the client, so an
     * impostor connecting under the same name would have been handed it anyway. The address is what
     * they cannot reproduce, and it is sufficient on its own.
     *
     * The id remains on the record for administration — listing a player's sessions, revoking one.
     */
    static async acceptByAddress(
        guildId: string,
        minecraftUuid: string,
        ipHash?: string,
    ): Promise<IMinecraftPlayerSession | null> {
        return MinecraftPlayerSession.findOneAndUpdate(
            {
                guildId,
                minecraftUuid: this.key(minecraftUuid),
                expiresAt: { $gt: new Date() },
                // `null` matches both an explicit null and a missing field in MongoDB, which is
                // exactly the pair wanted: a session stored without a hash is matched only by a
                // request that also supplies none.
                ipHash: ipHash ?? null,
            },
            { $set: { lastLoginAt: new Date() } },
            { returnDocument: "after" }
        ).sort({ expiresAt: -1 });
    }

    /**
     * Accepts a session by id and records the sighting.
     *
     * <h2>The address is part of the match, not a check afterwards</h2>
     *
     * A session is offered by the game server on the player's behalf — the client never holds it —
     * so on an offline-mode server the UUID alone proves nothing and an impostor would be handed the
     * account. The stored `ipHash` is what an impostor cannot reproduce, and putting it in the query
     * means a mismatched address cannot even find the row to update.
     *
     * A row saved without a hash (binding disabled when it was created) matches only a request that
     * also supplies none, so turning the setting on does not silently accept the sessions issued
     * while it was off — and turning it off does not accept the bound ones either.
     *
     * Returns null when the session is unknown, expired, belongs to another account, or was opened
     * elsewhere — all of which mean one thing to the caller: ask for the password.
     */
    static async accept(
        guildId: string,
        sessionId: string,
        minecraftUuid: string,
        ipHash?: string,
    ): Promise<IMinecraftPlayerSession | null> {
        return MinecraftPlayerSession.findOneAndUpdate(
            {
                guildId,
                sessionId,
                minecraftUuid: this.key(minecraftUuid),
                expiresAt: { $gt: new Date() },
                // `$in [hash, null]` would let an unbound session satisfy a bound request. Matched
                // exactly instead: absent means absent on both sides.
                // `null` matches both an explicit null and a missing field in MongoDB, which is
                // exactly the pair wanted: a session stored without a hash is matched only by a
                // request that also supplies none.
                ipHash: ipHash ?? null,
            },
            { $set: { lastLoginAt: new Date() } },
            { returnDocument: "after" }
        );
    }

    /** Every live session for a player, newest first. For the admin `List Sessions`. */
    static async list(guildId: string, minecraftUuid: string): Promise<IMinecraftPlayerSession[]> {
        return MinecraftPlayerSession.find({
            guildId,
            minecraftUuid: this.key(minecraftUuid),
            expiresAt: { $gt: new Date() },
        }).sort({ expiresAt: -1 });
    }

    /**
     * Ends every session for a player.
     *
     * The blunt form is the right one for the cases that need it — a password change, an unlink, an
     * administrator revoking access. All three mean "whatever was true before is no longer proof",
     * and revoking selectively would leave the device that was actually compromised logged in.
     *
     * @returns how many were ended, so the caller can report it.
     */
    static async revokeAll(guildId: string, minecraftUuid: string): Promise<number> {
        const result = await MinecraftPlayerSession.deleteMany({
            guildId,
            minecraftUuid: this.key(minecraftUuid),
        });
        return result.deletedCount ?? 0;
    }

    /** Ends one session by id, for a targeted revocation. */
    static async revoke(guildId: string, sessionId: string): Promise<boolean> {
        const result = await MinecraftPlayerSession.deleteOne({ guildId, sessionId });
        return (result.deletedCount ?? 0) > 0;
    }
}
