import { CoinsRepository } from "@database/repositories";

export interface BalanceAdjustment {
    /** Coins actually moved. Smaller than requested when a deduction would go below zero. */
    applied: number;
    total: number;
}

/**
 * Manually credits or debits a member, `amount` signed.
 *
 * A deduction is clamped at the member's balance rather than refused outright: an admin removing
 * "everything" should not have to look the number up first, and a negative balance has no meaning
 * anywhere else in the economy.
 *
 * The wallet is global, so this moves the member's balance everywhere — including in-game. That is
 * the point of the command, but it is worth knowing before granting a large amount.
 */
export async function adjustBalance(
    discordId: string,
    username: string,
    amount: number,
): Promise<BalanceAdjustment> {
    const current = await CoinsRepository.get(discordId);
    const balance = current?.coins ?? 0;
    const applied = amount < 0 ? -Math.min(balance, -amount) : amount;

    if (applied === 0) return { applied: 0, total: balance };

    const updated = await CoinsRepository.addCoins(discordId, username, applied);
    return { applied, total: updated.coins };
}
