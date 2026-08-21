import { Injectable } from "@nestjs/common";
import { LEADERBOARD_SIZE } from "../constants";
import type { LeaderboardEntryResponse } from "../dto";
import { EconomyRepository } from "../repositories";

@Injectable()
export class EconomyService {
    constructor(private readonly repository: EconomyRepository) {}

    async leaderboard(): Promise<LeaderboardEntryResponse[]> {
        const top = await this.repository.topBalances(LEADERBOARD_SIZE);

        return top.map((entry, index) => ({
            rank: index + 1,
            userId: entry.discordId,
            username: entry.username,
            coins: entry.coins,
        }));
    }
}
