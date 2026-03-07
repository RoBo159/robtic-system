import { Schema, model, type Document } from "mongoose";

export interface INote extends Document {
    userId: string;
    content: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const noteSchema = new Schema<INote>(
    {
        userId: { type: String, required: true, index: true },
        content: { type: String, required: true },
        createdBy: { type: String, required: true },
    },
    { timestamps: true }
);

noteSchema.index({ userId: 1, createdAt: -1 });

export const Note = model<INote>("Note", noteSchema);
