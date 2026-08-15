import { Schema, model, type Document } from "mongoose";

/** Per-guild voice activity configuration. See VOICE_DEFAULTS for the fallbacks. */
export interface IVoiceSettings extends Document {
    guildId: string;
    enabled: boolean;
    /** Channels that earn. Empty means every voice channel except the excluded ones. */
    trackedChannelIds: string[];
    /** Never earns, on top of the guild's own AFK channel, which is always excluded. */
    excludedChannelIds: string[];
    /** Only members with one of these earn. Empty means everyone. */
    allowedRoleIds: string[];
    /** Applied when a member is the only human present. */
    aloneMultiplier: number;
    /** Minutes without a deliberate interaction before voice rewards stop. */
    afkTimeoutMinutes: number;
    /** Humans needed in the channel for the full rate. */
    minMembersForFullRate: number;
    createdAt: Date;
    updatedAt: Date;
}

const voiceSettingsSchema = new Schema<IVoiceSettings>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        enabled: { type: Boolean, default: true },
        trackedChannelIds: { type: [String], default: [] },
        excludedChannelIds: { type: [String], default: [] },
        allowedRoleIds: { type: [String], default: [] },
        aloneMultiplier: { type: Number, default: 0.25 },
        afkTimeoutMinutes: { type: Number, default: 5 },
        minMembersForFullRate: { type: Number, default: 2 },
    },
    { timestamps: true }
);

export const VoiceSettings = model<IVoiceSettings>("VoiceSettings", voiceSettingsSchema);
