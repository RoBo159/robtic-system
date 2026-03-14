import { Schema, model, type Document } from "mongoose";

export interface ILevelReward extends Document {
    guildId: string;
    level: number;
    roleId: string;
    createdAt: Date;
    updatedAt: Date;
}

const levelRewardSchema = new Schema<ILevelReward>(
    {
        guildId: { type: String, required: true, index: true },
        level: { type: Number, required: true },
        roleId: { type: String, required: true },
    },
    { timestamps: true }
);

levelRewardSchema.index({ guildId: 1, level: 1 }, { unique: true });

export const LevelReward = model<ILevelReward>("LevelReward", levelRewardSchema);
