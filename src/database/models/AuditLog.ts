import { Schema, model, type Document } from "mongoose";

export interface IAuditLog extends Document {
    guildId?: string;
    eventName: string;
    source: string;
    actorId?: string;
    targetId?: string;
    channelId?: string;
    messageId?: string;
    botName?: BotName;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
    {
        guildId: { type: String, index: true },
        eventName: { type: String, required: true, index: true },
        source: { type: String, required: true, default: "discord" },
        actorId: { type: String, index: true },
        targetId: { type: String, index: true },
        channelId: { type: String, index: true },
        messageId: { type: String, index: true },
        botName: { type: String, index: true },
        metadata: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

auditLogSchema.index({ guildId: 1, createdAt: -1 });
auditLogSchema.index({ eventName: 1, createdAt: -1 });
auditLogSchema.index({ source: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);
