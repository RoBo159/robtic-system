import { Schema, model, type Document } from "mongoose";

/**
 * One stay in a voice channel.
 *
 * Written when a member joins and closed when they leave, with the running totals updated
 * periodically while it is open — so a crash costs minutes of an open session rather than the
 * whole thing. A session left open by a crash is closed on the next boot from `lastTickAt`, which
 * is why that field is persisted rather than kept only in memory.
 *
 * Rows are never rewritten after closing: session history is what average and longest session
 * length are computed from.
 */
export interface IVoiceSession extends Document {
    guildId: string;
    discordId: string;
    username: string;
    channelId: string;
    joinedAt: Date;
    /** Set when the session closes; null while it is open. */
    leftAt: Date | null;
    /** Last time the tick counted this session — also how a crashed session's end is reconstructed. */
    lastTickAt: Date;
    /** Seconds connected, whether or not they were earning. */
    connectedSeconds: number;
    /** Seconds that qualified for rewards: present, not AFK, not in the AFK channel. */
    activeSeconds: number;
    xpEarned: number;
    /** True once closed, so open sessions can be found without a null check on an indexed field. */
    closed: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const voiceSessionSchema = new Schema<IVoiceSession>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        username: { type: String, default: "" },
        channelId: { type: String, required: true },
        joinedAt: { type: Date, required: true },
        leftAt: { type: Date, default: null },
        lastTickAt: { type: Date, required: true },
        connectedSeconds: { type: Number, default: 0 },
        activeSeconds: { type: Number, default: 0 },
        xpEarned: { type: Number, default: 0 },
        closed: { type: Boolean, default: false, index: true },
    },
    { timestamps: true }
);

voiceSessionSchema.index({ guildId: 1, discordId: 1, joinedAt: -1 });
// Finding sessions a crash left open, on boot.
voiceSessionSchema.index({ closed: 1, lastTickAt: 1 });

export const VoiceSession = model<IVoiceSession>("VoiceSession", voiceSessionSchema);
