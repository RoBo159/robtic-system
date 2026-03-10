import { Schema, model, type Document } from "mongoose";

export interface IReason extends Document {
    key: string;
    label: string;
    labelAr: string;
    type: "warn" | "mute" | "ban";
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const reasonSchema = new Schema<IReason>(
    {
        key: { type: String, required: true, unique: true, index: true },
        label: { type: String, required: true },
        labelAr: { type: String, required: true },
        type: { type: String, enum: ["warn", "mute", "ban"], required: true },
        createdBy: { type: String, required: true },
    },
    { timestamps: true }
);

export const Reason = model<IReason>("Reason", reasonSchema);
