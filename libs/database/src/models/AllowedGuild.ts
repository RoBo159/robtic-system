import { Schema, model, type Document } from "mongoose";

/** A guild the bot is permitted to stay in. Anything not listed here is left on sight — see apps/bot/src/guards. */
export interface IAllowedGuild extends Document {
    guildId: string;
    /** Free-text label so the list stays readable when a guild is unreachable or the bot was never in it. */
    name?: string;
    /** Discord id of whoever authorised it, or "system" for the ids seeded at first boot. */
    addedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const allowedGuildSchema = new Schema<IAllowedGuild>(
    {
        guildId: { type: String, required: true, unique: true },
        name: { type: String },
        addedBy: { type: String, required: true },
    },
    { timestamps: true }
);

export const AllowedGuild = model<IAllowedGuild>("AllowedGuild", allowedGuildSchema);
