import { CoinsRepository } from "@database/repositories";

export interface CoinSummary {
    coins: number;
    rank: number;
}

/**
 * A member's Discord coin balance. Their Minecraft wallet is robs, which this does not touch.
 *
 * Coins are no longer earned from Discord activity — that is what Points are for — so there are no
 * earning rates left to report. What remains is the in-game balance, moved by the plugin over
 * /api/economy/coins and readable here.
 *
 * Global: the balance and the rank are the same in every server.
 */
export async function getCoinSummary(discordId: string): Promise<CoinSummary> {
    const [record, rank] = await Promise.all([
        CoinsRepository.get(discordId),
        CoinsRepository.getRank(discordId),
    ]);

    return { coins: record?.coins ?? 0, rank };
}
