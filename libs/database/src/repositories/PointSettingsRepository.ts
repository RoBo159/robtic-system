import { PointSettings, type IPointSettings, type IPointStreakReward } from "@database/models/PointSettings";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { settings: IPointSettings; expiresAt: number }>();

export class PointSettingsRepository {
    /** Read on every award, so cached with the usual short TTL. */
    static async getCached(guildId: string): Promise<IPointSettings> {
        const hit = cache.get(guildId);
        if (hit && hit.expiresAt > Date.now()) return hit.settings;

        const settings = await PointSettings.findOneAndUpdate(
            { guildId },
            { $setOnInsert: { guildId } },
            { upsert: true, returnDocument: "after" }
        ) as IPointSettings;

        cache.set(guildId, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
        return settings;
    }

    static async setRates(guildId: string, messagesPerPoint: number, comboPerPoint: number, voiceMinutesPerPoint: number): Promise<IPointSettings> {
        return this.update(guildId, { $set: { messagesPerPoint, comboPerPoint, voiceMinutesPerPoint } });
    }

    static async setStreakRewards(guildId: string, rewards: IPointStreakReward[]): Promise<IPointSettings> {
        return this.update(guildId, { $set: { streakRewards: rewards } });
    }

    static async setConversion(guildId: string, pointsPerRc: number, conversionEnabled: boolean, minConversionPoints: number): Promise<IPointSettings> {
        return this.update(guildId, { $set: { pointsPerRc, conversionEnabled, minConversionPoints } });
    }

    private static async update(guildId: string, mutation: object): Promise<IPointSettings> {
        const settings = await PointSettings.findOneAndUpdate(
            { guildId },
            mutation,
            { upsert: true, returnDocument: "after" }
        ) as IPointSettings;

        cache.delete(guildId);
        return settings;
    }

    static invalidate(guildId: string): void {
        cache.delete(guildId);
    }
}
