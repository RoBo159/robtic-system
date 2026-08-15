import { PointSettingsRepository } from "@database/repositories";

export interface PointRates {
    messagesPerPoint: number;
    comboPerPoint: number;
    voiceMinutesPerPoint: number;
    streakRewards: { streak: number; points: number }[];
    pointsPerRc: number;
    conversionEnabled: boolean;
    minConversionPoints: number;
}

/** The guild's economy rates. Settings are upserted with schema defaults, so nothing to fall back to. */
export async function getPointRates(guildId: string): Promise<PointRates> {
    const s = await PointSettingsRepository.getCached(guildId);

    return {
        messagesPerPoint: s.messagesPerPoint,
        comboPerPoint: s.comboPerPoint,
        voiceMinutesPerPoint: s.voiceMinutesPerPoint,
        streakRewards: s.streakRewards.map(r => ({ streak: r.streak, points: r.points })),
        pointsPerRc: s.pointsPerRc,
        conversionEnabled: s.conversionEnabled,
        minConversionPoints: s.minConversionPoints,
    };
}
