import { Schema, model, type Document } from "mongoose";

/**
 * A jail sentence, live or historic.
 *
 * Rows are never deleted — a release sets `released` rather than removing the row, so
 * `/jail-history` and the Discord embeds keep a complete record. Exactly one row per player may
 * be unreleased at a time, enforced by a partial unique index.
 *
 * Because the sentence lives here rather than in plugin memory, a restart cannot free a jailed
 * player: the plugin re-reads this on join.
 */
export interface IMinecraftJail extends Document {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    serverId: string;
    reason: string;
    moderatorUuid: string;
    moderatorUsername: string;
    /** Null for an indefinite sentence. */
    durationMs: number | null;
    jailedAt: Date;
    /** Null when indefinite; otherwise when the sentence lapses. */
    releaseAt: Date | null;
    released: boolean;
    releasedAt?: Date;
    releasedByUuid?: string;
    releasedByUsername?: string;
    releaseReason?: string;
    /** Whether the configured Discord jail role was applied, so it can be removed reliably. */
    discordRoleApplied: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftJailSchema = new Schema<IMinecraftJail>(
    {
        guildId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        serverId: { type: String, required: true, trim: true },
        reason: { type: String, required: true, trim: true },
        moderatorUuid: { type: String, required: true, lowercase: true, trim: true },
        moderatorUsername: { type: String, required: true, trim: true },
        durationMs: { type: Number, default: null },
        jailedAt: { type: Date, default: Date.now },
        releaseAt: { type: Date, default: null },
        released: { type: Boolean, default: false, index: true },
        releasedAt: { type: Date },
        releasedByUuid: { type: String, lowercase: true, trim: true },
        releasedByUsername: { type: String, trim: true },
        releaseReason: { type: String, trim: true },
        discordRoleApplied: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// A player can only be serving one sentence at a time; historic rows are exempt from the index.
minecraftJailSchema.index(
    { guildId: 1, minecraftUuid: 1 },
    { unique: true, partialFilterExpression: { released: false } }
);
minecraftJailSchema.index({ guildId: 1, minecraftUuid: 1, jailedAt: -1 });
// Drives the release sweep: only unreleased, timed sentences are ever scanned.
minecraftJailSchema.index({ released: 1, releaseAt: 1 });

export const MinecraftJail = model<IMinecraftJail>("MinecraftJail", minecraftJailSchema);
