import { Schema, model, type Document } from "mongoose";

/** How long an unanswered friend request survives before Mongo removes it. */
export const FRIEND_REQUEST_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * A pending friend request, directional until it is accepted.
 *
 * Unlike {@link MinecraftFriendship} this one *is* one row per direction, because who asked whom
 * is the whole content of the record — `/friend accept` has to know which side is being answered.
 *
 * Expired by Mongo rather than swept by the API: a request nobody answered for a week is noise,
 * and a TTL index removes it without anything having to run on a schedule.
 */
export interface IMinecraftFriendRequest extends Document {
    requesterUuid: string;
    requesterUsername: string;
    targetUuid: string;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftFriendRequestSchema = new Schema<IMinecraftFriendRequest>(
    {
        requesterUuid: { type: String, required: true, lowercase: true, trim: true },
        requesterUsername: { type: String, required: true, trim: true },
        targetUuid: { type: String, required: true, lowercase: true, trim: true, index: true },
    },
    { timestamps: true }
);

// One outstanding request per direction. A repeated /friend add is therefore an upsert rather than
// a way to flood somebody's inbox.
minecraftFriendRequestSchema.index({ requesterUuid: 1, targetUuid: 1 }, { unique: true });
minecraftFriendRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: FRIEND_REQUEST_TTL_SECONDS });

export const MinecraftFriendRequest = model<IMinecraftFriendRequest>(
    "MinecraftFriendRequest",
    minecraftFriendRequestSchema,
);
