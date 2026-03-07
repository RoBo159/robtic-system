import { Schema, model, type Document } from "mongoose";

export interface IModMailThread extends Document {
    threadId: string;
    userId: string;
    guildId: string;
    staffChannelId: string;
    language: "en" | "ar";
    requestType: "appeal" | "report" | "support";
    status: "open" | "closed";
    paused: boolean;
    claimedBy: string | null;
    messages: {
        authorId: string;
        authorType: "user" | "staff";
        content: string;
        attachments: string[];
        timestamp: Date;
    }[];
    closedBy: string | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const modMailThreadSchema = new Schema<IModMailThread>(
    {
        threadId: { type: String, required: true, unique: true, index: true },
        userId: { type: String, required: true, index: true },
        guildId: { type: String, required: true },
        staffChannelId: { type: String, required: true },
        language: {
            type: String,
            enum: ["en", "ar"],
            required: true,
        },
        requestType: {
            type: String,
            enum: ["appeal", "report", "support"],
            required: true,
        },
        status: {
            type: String,
            enum: ["open", "closed"],
            default: "open",
            index: true,
        },
        paused: { type: Boolean, default: false },
        claimedBy: { type: String, default: null },
        messages: [
            {
                authorId: { type: String, required: true },
                authorType: { type: String, enum: ["user", "staff"], required: true },
                content: { type: String, required: true },
                attachments: [{ type: String }],
                timestamp: { type: Date, default: Date.now },
            },
        ],
        closedBy: { type: String, default: null },
        closedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

modMailThreadSchema.index({ userId: 1, status: 1 });

export const ModMailThread = model<IModMailThread>("ModMailThread", modMailThreadSchema);
