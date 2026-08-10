import type { ICombo } from "@database/models";
import { ComboLeaderboardRepository } from "@database/repositories";
import { buildActivePairSnapshotOps } from "./build-active-pair-snapshot-ops";

export async function snapshotActivePairs(guildId: string, pairs: ICombo[]): Promise<void> {
    await ComboLeaderboardRepository.bulkUpsertMax(buildActivePairSnapshotOps(guildId, pairs, new Date()));
}
