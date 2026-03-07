import { Schema, model, type Document } from "mongoose";

export interface IServiceTier extends Document {
    name: string;
    guildId: string;
    roleId: string;
    price: number;
    currency: string;
    duration: number;
    benefits: string[];
    maxMembers: number | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const serviceTierSchema = new Schema<IServiceTier>(
    {
        name: { type: String, required: true },
        guildId: { type: String, required: true, index: true },
        roleId: { type: String, required: true },
        price: { type: Number, required: true },
        currency: { type: String, default: "USD" },
        duration: { type: Number, required: true },
        benefits: [{ type: String }],
        maxMembers: { type: Number, default: null },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
);

serviceTierSchema.index({ guildId: 1, name: 1 }, { unique: true });

export const ServiceTier = model<IServiceTier>("ServiceTier", serviceTierSchema);
