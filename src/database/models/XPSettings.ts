import { Schema, model, type Document } from "mongoose";

export interface IXPSettings extends Document {
    guildId: string;
    chatChannels: string[];
    supportChannels: string[];
    staffChannels: string[];
    allowedRoles: string[];
    decayEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const xpSettingsSchema = new Schema<IXPSettings>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        chatChannels: [{ type: String }],
        supportChannels: [{ type: String }],
        staffChannels: [{ type: String }],
        allowedRoles: [{ type: String }],
        decayEnabled: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export const XPSettings = model<IXPSettings>("XPSettings", xpSettingsSchema);
