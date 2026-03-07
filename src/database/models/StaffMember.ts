import { Schema, model, type Document } from "mongoose";

export interface IStaffMember extends Document {
    discordId: string;
    username: string;
    department: string;
    position: string;
    hiredAt: Date;
    status: "active" | "on-leave" | "suspended" | "terminated";
    warnings: {
        reason: string;
        issuedBy: string;
        date: Date;
    }[];
    notes: string[];
    createdAt: Date;
    updatedAt: Date;
}

const staffMemberSchema = new Schema<IStaffMember>(
    {
        discordId: { type: String, required: true, unique: true, index: true },
        username: { type: String, required: true },
        department: { type: String, required: true, index: true },
        position: { type: String, required: true },
        hiredAt: { type: Date, default: Date.now },
        status: {
            type: String,
            enum: ["active", "on-leave", "suspended", "terminated"],
            default: "active",
            index: true,
        },
        warnings: [
            {
                reason: { type: String, required: true },
                issuedBy: { type: String, required: true },
                date: { type: Date, default: Date.now },
            },
        ],
        notes: [{ type: String }],
    },
    { timestamps: true }
);

export const StaffMember = model<IStaffMember>("StaffMember", staffMemberSchema);
