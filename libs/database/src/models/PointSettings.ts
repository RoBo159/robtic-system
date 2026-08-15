import { Schema, model, type Document } from "mongoose";

export interface IPointStreakReward {
    /** Streak day-count that triggers the payout. */
    streak: number;
    points: number;
}

/** Per-guild economy tuning. See POINT_DEFAULTS for the fallbacks. */
export interface IPointSettings extends Document {
    guildId: string;
    /** Real messages needed per earned Point. */
    messagesPerPoint: number;
    /** Combo score needed per earned Point. */
    comboPerPoint: number;
    /** Minutes of *active* voice needed per earned Point. */
    voiceMinutesPerPoint: number;
    /** Streak day-counts that pay out when reached. */
    streakRewards: IPointStreakReward[];
    /** Points needed for one RC. */
    pointsPerRc: number;
    /** Whether members may convert at all. Lets a guild run Points without a premium currency. */
    conversionEnabled: boolean;
    /** Smallest conversion a member may make, so the ledger is not filled with 1-point rounding. */
    minConversionPoints: number;
    createdAt: Date;
    updatedAt: Date;
}

const pointSettingsSchema = new Schema<IPointSettings>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        messagesPerPoint: { type: Number, default: 100 },
        comboPerPoint: { type: Number, default: 100 },
        voiceMinutesPerPoint: { type: Number, default: 10 },
        streakRewards: {
            type: [{
                streak: { type: Number, required: true },
                points: { type: Number, required: true },
                _id: false,
            }],
            default: [],
        },
        pointsPerRc: { type: Number, default: 100 },
        conversionEnabled: { type: Boolean, default: true },
        minConversionPoints: { type: Number, default: 100 },
    },
    { timestamps: true }
);

export const PointSettings = model<IPointSettings>("PointSettings", pointSettingsSchema);
