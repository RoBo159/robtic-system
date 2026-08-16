import { PointsRepository, LegacyCoinRepository } from "@database/repositories";
import { Logger } from "@logger";

const CTX = "points";

export interface CoinMigrationResult {
    members: number;
    pointsGranted: number;
}

/**
 * Claims this guild's frozen pre-global coin balances as Points, once.
 *
 * Reads `LegacyCoin` — the snapshot taken when coins went global — not the live wallet. The live
 * wallet is global and starts everyone at zero, so there is nothing there that belongs to one
 * server; claiming from it would let one guild spend a balance earned on another, or drain a
 * player's in-game money. Reading the archive instead keeps the two apart entirely.
 *
 * Each row is marked consumed rather than deleted, so re-running is a no-op and the transfer stays
 * reconcilable against the `coin-migration` rows it wrote to PointHistory.
 *
 * Points are credited before the row is marked, so a crash in the middle leaves a claimable row to
 * reconcile rather than points that silently vanished.
 */
export async function migrateCoinsToPoints(guildId: string, actorId: string): Promise<CoinMigrationResult> {
    const wallets = await LegacyCoinRepository.findClaimable(guildId);

    let members = 0;
    let pointsGranted = 0;

    for (const wallet of wallets) {
        const amount = wallet.coins;
        if (amount <= 0) continue;

        await PointsRepository.move({
            guildId,
            discordId: wallet.discordId,
            username: wallet.username,
            amount,
            source: "coin-migration",
            detail: `Converted ${amount} legacy coins`,
            actorId,
        });

        await LegacyCoinRepository.markMigrated(guildId, wallet.discordId);

        members++;
        pointsGranted += amount;
    }

    Logger.info(`Claimed ${pointsGranted} legacy coins as points across ${members} member(s) in ${guildId}`, CTX);
    return { members, pointsGranted };
}

/** What `migrateCoinsToPoints` would grant, without granting it. Backs the command's confirmation. */
export async function previewCoinMigration(guildId: string): Promise<CoinMigrationResult> {
    const { members, coins } = await LegacyCoinRepository.summarise(guildId);
    return { members, pointsGranted: coins };
}
