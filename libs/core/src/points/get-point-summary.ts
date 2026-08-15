import { PointsRepository, PointHistoryRepository } from "@database/repositories";
import { getPointRates, type PointRates } from "./get-point-rates";

export interface PointSummary {
    points: number;
    lifetimePoints: number;
    rc: number;
    rank: number;
    /** Progress toward the next Point from each source. */
    messageProgress: number;
    comboProgress: number;
    voiceProgress: number;
    earned: number;
    spent: number;
    converted: number;
    bySource: Record<string, number>;
    rates: PointRates;
}

/** One member's wallet, standing and lifetime totals — everything /points and /profile need. */
export async function getPointSummary(guildId: string, discordId: string): Promise<PointSummary> {
    const [record, rank, rates, totals] = await Promise.all([
        PointsRepository.get(guildId, discordId),
        PointsRepository.getRank(guildId, discordId),
        getPointRates(guildId),
        PointHistoryRepository.totals(guildId, discordId),
    ]);

    return {
        points: record?.points ?? 0,
        lifetimePoints: record?.lifetimePoints ?? 0,
        rc: record?.rc ?? 0,
        rank,
        messageProgress: record?.messageProgress ?? 0,
        comboProgress: record?.comboProgress ?? 0,
        voiceProgress: record?.voiceProgress ?? 0,
        earned: totals.earned,
        spent: totals.spent,
        converted: totals.converted,
        bySource: totals.bySource,
        rates,
    };
}
