import { Injectable } from "@nestjs/common";
import { CoinsRepository } from "@database/repositories";
import type { ICoin } from "@database/models";

@Injectable()
export class EconomyRepository {
    /**
     * Not scoped by guild, and that is not an oversight.
     *
     * `CoinsRepository` is keyed by Discord user id alone — a member's balance is the same in every
     * server the bot is in. Adding a `guildId` parameter here would imply a per-guild balance that
     * the schema cannot express and the bot does not maintain.
     */
    topBalances(limit: number): Promise<ICoin[]> {
        return CoinsRepository.getTop(limit);
    }
}
