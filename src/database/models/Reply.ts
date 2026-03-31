import { Schema, model, type Document } from "mongoose";

export interface IReply extends Document {
    guildId: string;
    trigger: string;
    replies: string[];
    channels?: string[];
    allowRoles?: string[];
    blockRoles?: string[];
    blockChannels?: string[];
}

const replySchema = new Schema<IReply>(
    {
        guildId: { type: String, required: true, index: true },
        trigger: { type: String, required: true },
        replies: { type: [String], required: true },
        channels: { type: [String], default: [] },
        allowRoles: { type: [String], default: [] },
        blockRoles: { type: [String], default: [] },
        blockChannels: { type: [String], default: [] },
    },
    { timestamps: true }
);

export const Reply = model<IReply>("Reply", replySchema);
