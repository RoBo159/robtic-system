import { Coin } from "@database/models";
import { PointsRepository } from "@database/repositories";
import { Logger } from "@logger";

const CTX = "points";

export interface CoinMigrationResult {
    members: number;
    pointsGranted: number;
}

/**
 * Moves a guild's legacy Coin balances into Points, once.
 *
 * Deliberately *not* run at boot. It zeroes the Coin balance it moves, and Coin is also the
 * Minecraft in-game wallet — so this is a decision an operator makes per guild with the
 * consequences in front of them, not something that happens because the process restarted.
 *
 * Nothing is destroyed silently: every move is written to PointHistory under the `coin-migration`
 * source with the original amount, so the transfer can be audited and reversed by hand.
 *
 * Re-running is safe. A member whose Coin balance is already zero has nothing left to move.
 */
export async function migrateCoinsToPoints(guildId: string, actorId: string): Promise<CoinMigrationResult> {
    const wallets = await Coin.find({ guildId, coins: { $gt: 0 } });

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

        // Zeroed only after the Points are credited and the ledger row exists, so a crash in the
        // middle leaves a duplicate to reconcile rather than a balance that vanished.
        await Coin.updateOne({ _id: wallet._id }, { $set: { coins: 0 } });

        members++;
        pointsGranted += amount;
    }

    Logger.info(`Migrated ${pointsGranted} coins into points across ${members} member(s) in ${guildId}`, CTX);
    return { members, pointsGranted };
}
