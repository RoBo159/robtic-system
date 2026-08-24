import { Schema, model, type Document } from "mongoose";

/**
 * Proof that a player authenticated recently, so a returning player skips the login screen.
 *
 * <h2>Why a stored session and not a flag on the account</h2>
 *
 * A flag would answer "is this player logged in?", which is not the question. The question is "has
 * this player proved who they are recently enough that asking again is noise?" — and that has to
 * survive a disconnect, a server restart, and a hop between the lobby and survival, while still
 * ending on its own. A row with an expiry answers it; a boolean does not, and a boolean is also
 * something an administrator has no way to revoke for one player without touching the others.
 *
 * <h2>Rows are removed by TTL, so expiry needs no scheduler</h2>
 *
 * `expiresAt` carries a TTL index, exactly as the link code does. That makes expiry a property of
 * the data rather than a task that has to be running — which matters here, because the failure mode
 * of a missed sweep is a session that outlives its welcome.
 *
 * MongoDB's TTL monitor runs about once a minute, so a row can outlast its expiry by up to that
 * long. Every read therefore checks `expiresAt` itself and treats the index as housekeeping rather
 * than as the authority — the deletion reclaims space; the comparison decides access.
 *
 * <h2>Bound to an address, and it has to be</h2>
 *
 * A session is presented by the *server*, not by the client — the plugin looks one up by UUID and
 * offers it. On an offline-mode server, which is the only kind that needs passwords at all, anybody
 * can connect claiming any username, so the UUID is not proof of anything. A session keyed on UUID
 * alone would therefore hand an impostor the account without ever asking for the password: the
 * feature would not merely be weak, it would be a hole straight through the system it belongs to.
 *
 * The address is the one thing an impostor does not share, so {@link ipHash} is what makes a session
 * mean something. It is stored hashed: the comparison works exactly the same, and a database dump
 * does not become a list of players' home addresses.
 *
 * The cost is real and is accepted knowingly — a player who moves between wifi and mobile data logs
 * in again. That is the correct direction to fail, and operators running online-mode (where Mojang
 * has already proved the identity) can turn the binding off in `auth.yml`.
 */
export interface IMinecraftPlayerSession extends Document {
    guildId: string;
    /** Opaque, unguessable identifier. Never derived from the UUID or the password. */
    sessionId: string;
    minecraftUuid: string;
    discordId: string;

    /** Server key the session was created on, for `List Sessions` and for auditing. */
    serverKey?: string;

    /**
     * SHA-256 of the address the session was opened from, or absent when binding is off.
     *
     * Hashed rather than stored: it is only ever compared, never displayed, so the plaintext buys
     * nothing and costs a database full of personal data.
     */
    ipHash?: string;

    createdAt: Date;
    expiresAt: Date;
    /** Refreshed each time the session is accepted, so `List Sessions` shows real recency. */
    lastLoginAt: Date;

    updatedAt: Date;
}

const minecraftPlayerSessionSchema = new Schema<IMinecraftPlayerSession>(
    {
        guildId: { type: String, required: true, index: true },
        sessionId: { type: String, required: true, unique: true, trim: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        discordId: { type: String, required: true, index: true },
        serverKey: { type: String, trim: true },
        ipHash: { type: String, trim: true },
        expiresAt: { type: Date, required: true },
        lastLoginAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

/** The read on join: this player's live sessions, newest first. */
minecraftPlayerSessionSchema.index({ guildId: 1, minecraftUuid: 1, expiresAt: -1 });

/** Housekeeping only — see the class note on why reads still compare `expiresAt` themselves. */
minecraftPlayerSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MinecraftPlayerSession = model<IMinecraftPlayerSession>(
    "MinecraftPlayerSession",
    minecraftPlayerSessionSchema,
);
