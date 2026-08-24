import {
    MinecraftPlayerAccount,
    type IMinecraftPlayerAccount,
} from "@database/models/MinecraftPlayerAccount";

/**
 * Authentication records.
 *
 * <h2>The hash is opt-in on every read</h2>
 *
 * `passwordHash` is `select: false` on the schema, so every method here returns an account *without*
 * it unless the caller used {@link getWithHash}. That is the point: a credential should have to be
 * asked for by name, so the code paths that handle one are the ones that say so, and a route that
 * serialises an account cannot leak a hash by forgetting to strip it.
 */
export class MinecraftPlayerAccountRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    static async getByUuid(guildId: string, minecraftUuid: string): Promise<IMinecraftPlayerAccount | null> {
        return MinecraftPlayerAccount.findOne({ guildId, minecraftUuid: this.key(minecraftUuid) });
    }

    static async getByDiscordId(guildId: string, discordId: string): Promise<IMinecraftPlayerAccount | null> {
        return MinecraftPlayerAccount.findOne({ guildId, discordId });
    }

    /**
     * The account including its hash, for the one caller that verifies a password.
     *
     * Returns null both for "no account" and for "account with no password yet" — the caller wants
     * the hash, and the absence of one is the same answer either way. Whether the player is allowed
     * to *set* one is a different question, answered by {@link getByUuid} finding the row.
     */
    static async getWithHash(guildId: string, minecraftUuid: string): Promise<IMinecraftPlayerAccount | null> {
        return MinecraftPlayerAccount.findOne({ guildId, minecraftUuid: this.key(minecraftUuid) })
            .select("+passwordHash");
    }

    /**
     * Creates or updates the account for a linked player, without touching the password.
     *
     * Called when a link is made and whenever a username changes. Upserted rather than created so a
     * player linked before RobticAuth gains an account row the first time anything asks for one —
     * which is what lets an existing link keep working with no migration.
     */
    static async ensure(input: {
        guildId: string;
        minecraftUuid: string;
        minecraftUsername: string;
        discordId: string;
    }): Promise<IMinecraftPlayerAccount> {
        return MinecraftPlayerAccount.findOneAndUpdate(
            { guildId: input.guildId, minecraftUuid: this.key(input.minecraftUuid) },
            {
                $set: {
                    minecraftUsername: input.minecraftUsername,
                    discordId: input.discordId,
                },
                $setOnInsert: { failedAttempts: 0 },
            },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftPlayerAccount>;
    }

    /**
     * Sets or replaces the password, and clears the failure budget.
     *
     * One method for both, because they are the same write and distinguishing them would mean the
     * caller deciding which case it is in — the decision that produces a "first password" path
     * nobody exercises. Setting a password is also implicit proof of ownership, so any run of failed
     * attempts against the old one stops counting.
     */
    static async setPassword(
        guildId: string,
        minecraftUuid: string,
        passwordHash: string,
    ): Promise<IMinecraftPlayerAccount | null> {
        return MinecraftPlayerAccount.findOneAndUpdate(
            { guildId, minecraftUuid: this.key(minecraftUuid) },
            {
                $set: { passwordHash, passwordSetAt: new Date(), failedAttempts: 0 },
                $unset: { failedAttemptsSince: "" },
            },
            { returnDocument: "after" }
        ).select("+passwordHash");
    }

    /** Removes the password, leaving the account and its link in place. For the admin reset. */
    static async clearPassword(guildId: string, minecraftUuid: string): Promise<boolean> {
        const result = await MinecraftPlayerAccount.updateOne(
            { guildId, minecraftUuid: this.key(minecraftUuid) },
            { $unset: { passwordHash: "", passwordSetAt: "" }, $set: { failedAttempts: 0 } },
        );
        return result.matchedCount > 0;
    }

    /** Records a successful authentication and resets the failure budget. */
    static async recordLogin(
        guildId: string,
        minecraftUuid: string,
        serverKey?: string,
    ): Promise<void> {
        await MinecraftPlayerAccount.updateOne(
            { guildId, minecraftUuid: this.key(minecraftUuid) },
            {
                $set: { lastLoginAt: new Date(), lastLoginServer: serverKey, failedAttempts: 0 },
                $unset: { failedAttemptsSince: "" },
            },
        );
    }

    /**
     * Records a failed attempt and returns the running total.
     *
     * `failedAttemptsSince` is stamped only when a run begins, so the caller can tell a burst of
     * five attempts in a minute from five spread over a week — which is the difference between an
     * attack and a player with a bad memory.
     */
    static async recordFailure(guildId: string, minecraftUuid: string): Promise<number> {
        const now = new Date();

        // A pipeline update, so "increment the count, and stamp the start only if this is the first
        // failure of a run" is one atomic write. Read-then-write would let two simultaneous attempts
        // both see zero and both claim to be the first, which is precisely the case a rate limit
        // exists to catch.
        const account = await MinecraftPlayerAccount.findOneAndUpdate(
            { guildId, minecraftUuid: this.key(minecraftUuid) },
            [
                {
                    $set: {
                        failedAttempts: { $add: [{ $ifNull: ["$failedAttempts", 0] }, 1] },
                        failedAttemptsSince: { $ifNull: ["$failedAttemptsSince", now] },
                    },
                },
            ],
            { returnDocument: "after" }
        );

        return account?.failedAttempts ?? 0;
    }

    /** Clears a failure run, for the admin unlock and for a window that has elapsed. */
    static async clearFailures(guildId: string, minecraftUuid: string): Promise<void> {
        await MinecraftPlayerAccount.updateOne(
            { guildId, minecraftUuid: this.key(minecraftUuid) },
            { $set: { failedAttempts: 0 }, $unset: { failedAttemptsSince: "" } },
        );
    }

    /** Removes the account entirely. Used by unlink, which drops the credential with the link. */
    static async delete(guildId: string, minecraftUuid: string): Promise<boolean> {
        const result = await MinecraftPlayerAccount.deleteOne({
            guildId,
            minecraftUuid: this.key(minecraftUuid),
        });
        return result.deletedCount > 0;
    }
}
