import { Schema, model } from "mongoose";

export interface ISend extends Document {
    channel: string;
    user: string;
}

const sendSchema = new Schema<ISend>({
    channel: { type: String, required: true },
    user: { type: String, required: true }
});

export const Send = model<ISend>("send", sendSchema);