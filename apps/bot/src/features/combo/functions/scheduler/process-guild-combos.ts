import type { Guild } from "discord.js";
import { ComboRepository, ComboUserStatsRepository } from "@database/repositories";
import { finalizeExpiredCombos } from "../combo";
import { computeHeat } from "../heat";
import { snapshotActivePairs } from "../leaderboard";
import { syncChampionRole } from "../../utils/combo-champion-role";

export async function processGuildCombos(guild: Guild): Promise<void> {
    const now = Date.now();
    const stillActive = await finalizeExpiredCombos(guild);

    const scoreByUser = new Map<string, number>();

    for (const pair of stillActive) {
        const elapsed = now - pair.lastMessageAt.getTime();

        const decayedHeat = computeHeat(pair.heat, elapsed, false, 0);
        if (Math.round(decayedHeat) !== Math.round(pair.heat)) {
            await ComboRepository.setHeat(guild.id, pair.userLowId, pair.userHighId, decayedHeat);
            pair.heat = decayedHeat;
        }

        scoreByUser.set(pair.userLowId, Math.max(scoreByUser.get(pair.userLowId) ?? 0, pair.currentScore));
        scoreByUser.set(pair.userHighId, Math.max(scoreByUser.get(pair.userHighId) ?? 0, pair.currentScore));
    }

    if (stillActive.length > 0) {
        await snapshotActivePairs(guild.id, stillActive);
    }

    const allTimeStats = await ComboUserStatsRepository.getAllForGuild(guild.id);
    for (const stat of allTimeStats) {
        scoreByUser.set(stat.discordId, Math.max(scoreByUser.get(stat.discordId) ?? 0, stat.bestComboScore));
    }

    await syncChampionRole(guild, scoreByUser);
}
