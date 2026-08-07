import { Schema, model, type Document } from "mongoose";

/**
 * An API key that authorises a client — normally one Minecraft server — to call the Robtic API.
 *
 * Only the SHA-256 digest is stored, so a database leak yields nothing usable. Rotation works by
 * issuing a second row for the same server and letting both keys validate until the old one is
 * revoked, which is what allows a key change without restarting the game server.
 */
export interface IMinecraftApiKey extends Document {
    guildId: string;
    /** Hex SHA-256 of the plaintext key. The plaintext is shown once at issue and never stored. */
    keyHash: string;
    /** Human label shown in the admin listing, e.g. "survival-01". */
    label: string;
    /** Server this key may act for, or null for a guild-wide key. */
    serverId: string | null;
    /** Capabilities, from API_SCOPES in the SDK. */
    scopes: string[];
    revoked: boolean;
    revokedAt?: Date;
    lastUsedAt?: Date;
    /** Set when this key supersedes another, for audit of a rotation. */
    rotatedFromLabel?: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftApiKeySchema = new Schema<IMinecraftApiKey>(
    {
        guildId: { type: String, required: true, index: true },
        keyHash: { type: String, required: true, unique: true, index: true },
        label: { type: String, required: true, trim: true },
        serverId: { type: String, default: null, trim: true },
        scopes: { type: [String], default: [] },
        revoked: { type: Boolean, default: false },
        revokedAt: { type: Date },
        lastUsedAt: { type: Date },
        rotatedFromLabel: { type: String, trim: true },
        createdBy: { type: String, required: true },
    },
    { timestamps: true }
);

minecraftApiKeySchema.index({ guildId: 1, label: 1 }, { unique: true });

export const MinecraftApiKey = model<IMinecraftApiKey>("MinecraftApiKey", minecraftApiKeySchema);
