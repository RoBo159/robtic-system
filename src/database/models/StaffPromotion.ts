import { Schema, model, type Document } from "mongoose";

export interface IStaffPromotion extends Document {
    staffId: string;
    discordId: string;
    previousPosition: string;
    newPosition: string;
    previousDepartment: string;
    newDepartment: string;
    type: "promotion" | "demotion" | "transfer";
    reason: string;
    approvedBy: string;
    createdAt: Date;
}

const staffPromotionSchema = new Schema<IStaffPromotion>(
    {
        staffId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        previousPosition: { type: String, required: true },
        newPosition: { type: String, required: true },
        previousDepartment: { type: String, required: true },
        newDepartment: { type: String, required: true },
        type: {
            type: String,
            enum: ["promotion", "demotion", "transfer"],
            required: true,
        },
        reason: { type: String, required: true },
        approvedBy: { type: String, required: true },
    },
    { timestamps: true }
);

staffPromotionSchema.index({ discordId: 1, createdAt: -1 });

export const StaffPromotion = model<IStaffPromotion>("StaffPromotion", staffPromotionSchema);
