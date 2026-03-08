import { Schema, model, type Document } from "mongoose";

export interface ITag extends Document {
    key: string;
    description: string;
    content: {
        en: string;
        ar: string;
    }
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const tagSchema = new Schema<ITag>(
    {
        key: { type: String, required: true, unique: true, index: true },
        description: { type: String, required: true },
        content: {
            en: { type: String, required: true },
            ar: { type: String, required: true }
        },
        createdBy: { type: String, required: true },
    },
    { timestamps: true }
);

export const Tag = model<ITag>("Tag", tagSchema);
