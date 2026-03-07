import { Schema, model } from "mongoose";

export interface ISend extends Document {
    channel: string;
    type: "none" | "line";
    user: string;
}

const sendSchema = new Schema<ISend>({
    channel: { type: String, required: true },
    type: { type: String, default: "none" },
    user: { type: String, required: true }
});

export const Send = model<ISend>("send", sendSchema);