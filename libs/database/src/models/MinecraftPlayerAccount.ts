import { Schema, model, type Document } from "mongoose";

/**
 * A player's authentication record: the password that lets them into the game server.
 *
 * <h2>Why this is not part of MinecraftLink</h2>
 *
 * {@link IMinecraftLink} answers "which Discord account is this Minecraft account?" and is read on
 * every join, by the role sync, by the economy and by half the staff tooling. A password hash has no
 * business travelling with any of that. Keeping it in its own collection means the credential is
 * loaded only by the code that verifies it, and a query that returns a link cannot accidentally
 * serialise a hash into a response.
 *
 * It also means the existing link keeps working untouched. Every account linked before RobticAuth
 * has a link row and no account row, which is a state this system is built to handle rather than a
 * migration it has to perform — see below.
 *
 * <h2>A linked player without a password is normal</h2>
 *
 * {@link passwordHash} is optional, and its absence is not an error. It describes two ordinary
 * players:
 *
 * <ul>
 *   <li>somebody who linked before authentication existed, and has never set one;</li>
 *   <li>somebody whose password was cleared by an administrator.</li>
 * </ul>
 *
 * Neither is locked out. Both reach the same place a player who has forgotten their password
 * reaches — a recovery code from the login screen, redeemed on Discord, which *sets* the hash rather
 * than replacing it. There is deliberately no separate "first password" flow, because a flow used
 * once per player is a flow nobody tests.
 *
 * <h2>What is stored, and what is never stored</h2>
 *
 * The Argon2id encoded hash and nothing else. The encoded form carries its own salt and parameters,
 * so a change to {@code MINECRAFT_AUTH.argon2} applies to new passwords without invalidating old
 * ones. The plaintext is never written, never logged, and never leaves the API — the game server
 * asks whether a password is correct and is told yes or no.
 */
export interface IMinecraftPlayerAccount extends Document {
    guildId: string;
    /** Dashed Mojang UUID. The account is keyed by Minecraft identity, as the link and robs are. */
    minecraftUuid: string;
    minecraftUsername: string;
    /** Denormalised from the link so a verification needs one read rather than two. */
    discordId: string;

    /**
     * Argon2id encoded hash, or absent for a player who has not set a password yet.
     *
     * Absence is a supported state, not a broken row. See the class note.
     */
    passwordHash?: string;
    /** When the password was last set or changed, for the security notice on the Discord side. */
    passwordSetAt?: Date;

    /** Last successful authentication, from any server on the network. */
    lastLoginAt?: Date;
    /** Server key of that authentication, for auditing multi-server setups. */
    lastLoginServer?: string;

    /**
     * Consecutive failed password attempts, and when the run started.
     *
     * Held here rather than in memory so a budget survives an API restart and is shared across
     * replicas — an attacker must not be able to reset it by reconnecting. Cleared on success.
     */
    failedAttempts: number;
    failedAttemptsSince?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const minecraftPlayerAccountSchema = new Schema<IMinecraftPlayerAccount>(
    {
        guildId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        discordId: { type: String, required: true, index: true },

        // `select: false` so the hash is omitted unless a query asks for it by name. A credential
        // should have to be requested deliberately; the default read of an account — for a profile,
        // an admin listing, a session check — has no reason to carry one.
        passwordHash: { type: String, select: false },
        passwordSetAt: { type: Date },

        lastLoginAt: { type: Date },
        lastLoginServer: { type: String, trim: true },

        failedAttempts: { type: Number, default: 0, min: 0 },
        failedAttemptsSince: { type: Date },
    },
    { timestamps: true }
);

/** One account per Minecraft identity per guild — the same uniqueness the link itself has. */
minecraftPlayerAccountSchema.index({ guildId: 1, minecraftUuid: 1 }, { unique: true });

/** The Discord side resolves by Discord id: every modal knows who clicked, not which UUID. */
minecraftPlayerAccountSchema.index({ guildId: 1, discordId: 1 }, { unique: true });

export const MinecraftPlayerAccount = model<IMinecraftPlayerAccount>(
    "MinecraftPlayerAccount",
    minecraftPlayerAccountSchema,
);
