import { Schema, model, type Document } from "mongoose";

export interface IUser extends Document {
    discordId: string;
    username: string;
    joinedAt: Date;
    roles: string[];
    warnings: number;
    punishmentLevel: number;
    isBanned: boolean;
    notes: string[];
    createdAt: Date;
    updatedAt: Date;
}

const userSchema = new Schema<IUser>(
    {
        discordId: { type: String, required: true, unique: true, index: true },
        username: { type: String, required: true },
        joinedAt: { type: Date, default: Date.now },
        roles: [{ type: String }],
        warnings: { type: Number, default: 0 },
        punishmentLevel: { type: Number, default: 0 },
        isBanned: { type: Boolean, default: false },
        notes: [{ type: String }],
    },
    { timestamps: true }
);

export const User = model<IUser>("User", userSchema);
