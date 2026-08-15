import { Schema, model, type Document } from "mongoose";

/**
 * A member's activity wallet in one guild: Points earned from participating, and RC converted
 * from them.
 *
 * Separate from Coin on purpose. Coin is the Minecraft in-game currency and is spoken over the
 * plugin API (`/api/economy/coins`), so it answers to a contract this repo does not own. Points
 * are the Discord-side activity currency — messages, combo, streak, voice, and whatever comes
 * next — and RC is the premium currency they convert into.
 */
export interface IPoint extends Document {
    guildId: string;
    discordId: string;
    username: string;
    /** Spendable activity currency. */
    points: number;
    /** Lifetime earned, never decremented — spending reduces `points` only. */
    lifetimePoints: number;
    /** Premium currency. Only ever produced by converting Points. */
    rc: number;
    /** Rolling progress toward the next Point from each source. */
    messageProgress: number;
    comboProgress: number;
    voiceProgress: number;
    createdAt: Date;
    updatedAt: Date;
}

const pointSchema = new Schema<IPoint>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        username: { type: String, required: true },
        points: { type: Number, default: 0 },
        lifetimePoints: { type: Number, default: 0 },
        rc: { type: Number, default: 0 },
        messageProgress: { type: Number, default: 0 },
        comboProgress: { type: Number, default: 0 },
        voiceProgress: { type: Number, default: 0 },
    },
    { timestamps: true }
);

pointSchema.index({ guildId: 1, discordId: 1 }, { unique: true });
pointSchema.index({ guildId: 1, points: -1 });
pointSchema.index({ guildId: 1, rc: -1 });

export const Point = model<IPoint>("Point", pointSchema);
