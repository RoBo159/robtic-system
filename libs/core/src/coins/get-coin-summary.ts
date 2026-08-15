import { CoinsRepository } from "@database/repositories";

export interface CoinSummary {
    coins: number;
    rank: number;
}

/**
 * A member's Minecraft wallet.
 *
 * Coins are no longer earned from Discord activity — that is what Points are for — so there are no
 * earning rates left to report. What remains is the in-game balance, moved by the plugin over
 * /api/economy/coins and readable here.
 */
export async function getCoinSummary(guildId: string, discordId: string): Promise<CoinSummary> {
    const [record, rank] = await Promise.all([
        CoinsRepository.get(guildId, discordId),
        CoinsRepository.getRank(guildId, discordId),
    ]);

    return { coins: record?.coins ?? 0, rank };
}
