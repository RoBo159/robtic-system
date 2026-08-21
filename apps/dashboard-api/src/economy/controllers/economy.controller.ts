import { Controller, Get, UseGuards } from "@nestjs/common";
import { GuildAccessGuard } from "../../auth/guards";
import type { LeaderboardEntryResponse } from "../dto";
import { EconomyService } from "../services";

/**
 * The coin leaderboard.
 *
 * Its own module, though it is one endpoint. It previously lived at the bottom of
 * `quests.controller.ts` as a second `@Controller` class in the same file — quests and coins are
 * different domains that happen to both be "fun stuff", and a reader looking for the leaderboard had
 * no reason to open a file named after quests.
 *
 * The route is still guild-scoped and still guarded, even though the data behind it is global.
 * Coins are keyed by Discord user id alone, so this returns the same rows for every guild — but the
 * URL the dashboard calls names a guild, and a route under `/guilds/:guildId/` that skipped
 * `GuildAccessGuard` would be indistinguishable from one that forgot it. The guard costs a cached
 * Discord lookup and keeps the rule *every guild-scoped route is guarded* true without exception.
 */
@Controller("guilds/:guildId/economy")
@UseGuards(GuildAccessGuard)
export class EconomyController {
    constructor(private readonly economy: EconomyService) {}

    @Get("leaderboard")
    leaderboard(): Promise<LeaderboardEntryResponse[]> {
        return this.economy.leaderboard();
    }
}
