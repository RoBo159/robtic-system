import { Schema, model, type Document } from "mongoose";

export interface IBotConfig extends Document {
    key: string;
    value: unknown;
    botName: string;
    enabled: boolean;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const botConfigSchema = new Schema<IBotConfig>(
    {
        key: { type: String, required: true },
        value: { type: Schema.Types.Mixed, required: true },
        botName: { type: String, required: true },
        enabled: { type: Boolean, default: true },
        updatedBy: { type: String, required: true },
    },
    { timestamps: true }
);

botConfigSchema.index({ key: 1, botName: 1 }, { unique: true });

export const BotConfig = model<IBotConfig>("BotConfig", botConfigSchema);
