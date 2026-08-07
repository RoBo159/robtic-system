import { Schema, model, type Document } from "mongoose";

/**
 * A private staff note about a player. Never shown in game to anyone outside staff, and never
 * deleted — notes exist precisely so that context survives staff turnover.
 */
export interface IMinecraftNote extends Document {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    serverId: string;
    text: string;
    authorUuid: string;
    authorUsername: string;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftNoteSchema = new Schema<IMinecraftNote>(
    {
        guildId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        serverId: { type: String, required: true, trim: true },
        text: { type: String, required: true, trim: true },
        authorUuid: { type: String, required: true, lowercase: true, trim: true },
        authorUsername: { type: String, required: true, trim: true },
    },
    { timestamps: true }
);

minecraftNoteSchema.index({ guildId: 1, minecraftUuid: 1, createdAt: -1 });

export const MinecraftNote = model<IMinecraftNote>("MinecraftNote", minecraftNoteSchema);
