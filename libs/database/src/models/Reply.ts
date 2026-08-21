import { Schema, model, type Document } from "mongoose";

/**
 * One reply behind a trigger.
 *
 * Replies used to be bare strings, which made two things impossible: removing *one* of a trigger's
 * replies (there was nothing to name it by), and saying who added it. Both are now on the entry.
 */
export interface IReplyEntry {
    /** Short, stable, and unique within the guild — what `/reply remove` takes. */
    id: string;
    text: string;
    /** Discord id of whoever added it. Empty for entries that predate this field. */
    createdBy: string;
    createdAt: Date;
}

export interface IReply extends Document {
    guildId: string;
    trigger: string;
    /**
     * Stored as Mixed rather than a subdocument array, so documents written before entries existed
     * — where this was a `string[]` — still load instead of throwing a CastError. `toReplyEntries`
     * is the one place that reconciles the two shapes.
     */
    replies: (IReplyEntry | string)[];
    channels?: string[];
    allowRoles?: string[];
    blockRoles?: string[];
    blockChannels?: string[];
}

const replySchema = new Schema<IReply>(
    {
        guildId: { type: String, required: true, index: true },
        trigger: { type: String, required: true },
        replies: { type: [Schema.Types.Mixed], required: true },
        channels: { type: [String], default: [] },
        allowRoles: { type: [String], default: [] },
        blockRoles: { type: [String], default: [] },
        blockChannels: { type: [String], default: [] },
    },
    { timestamps: true }
);

replySchema.index({ guildId: 1, trigger: 1 }, { unique: true });

export const Reply = model<IReply>("Reply", replySchema);

/**
 * Normalises a document's replies into entries.
 *
 * A legacy string gets a derived id and an empty author rather than being rewritten in place: the
 * read path must not depend on a migration having run, and an id derived from position stays
 * stable for as long as the array does — which is long enough to remove one by it.
 */
export function toReplyEntries(replies: (IReplyEntry | string)[] | undefined): IReplyEntry[] {
    return (replies ?? []).map((entry, index) => {
        if (typeof entry === "string") {
            return { id: `legacy${index + 1}`, text: entry, createdBy: "", createdAt: new Date(0) };
        }
        return entry;
    });
}

/** Six lowercase characters — short enough to type, wide enough not to collide in a guild. */
export function newReplyId(): string {
    return Math.random().toString(36).slice(2, 8);
}
