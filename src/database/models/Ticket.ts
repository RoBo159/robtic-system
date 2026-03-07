import { Schema, model, type Document } from "mongoose";

export interface ITicket extends Document {
    ticketId: string;
    guildId: string;
    channelId: string;
    userId: string;
    assignedTo: string | null;
    category: string;
    subject: string;
    status: "open" | "in-progress" | "escalated" | "closed";
    priority: "low" | "medium" | "high" | "urgent";
    messages: {
        authorId: string;
        content: string;
        timestamp: Date;
    }[];
    closedBy: string | null;
    closedAt: Date | null;
    transcript: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const ticketSchema = new Schema<ITicket>(
    {
        ticketId: { type: String, required: true, unique: true, index: true },
        guildId: { type: String, required: true, index: true },
        channelId: { type: String, required: true },
        userId: { type: String, required: true, index: true },
        assignedTo: { type: String, default: null },
        category: { type: String, required: true },
        subject: { type: String, required: true },
        status: {
            type: String,
            enum: ["open", "in-progress", "escalated", "closed"],
            default: "open",
            index: true,
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high", "urgent"],
            default: "medium",
        },
        messages: [
            {
                authorId: { type: String, required: true },
                content: { type: String, required: true },
                timestamp: { type: Date, default: Date.now },
            },
        ],
        closedBy: { type: String, default: null },
        closedAt: { type: Date, default: null },
        transcript: { type: String, default: null },
    },
    { timestamps: true }
);

ticketSchema.index({ guildId: 1, status: 1 });
ticketSchema.index({ userId: 1, status: 1 });

export const Ticket = model<ITicket>("Ticket", ticketSchema);
