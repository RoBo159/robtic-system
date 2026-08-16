/**
 * One-time migration: per-guild coins -> one global wallet.
 *
 *   bun run migrate:coins-global -- --dry-run    inspect, change nothing
 *   bun run migrate:coins-global -- --confirm    do it
 *
 * What it does, in order:
 *
 *   1. Copies every existing `coins` document into `legacycoins`, keeping its guildId. This is the
 *      archive `/points migrate-coins` later claims from, and the only surviving record of who had
 *      what per server.
 *   2. Empties `coins`. Balances are NOT merged — every wallet restarts at zero, which is what was
 *      asked for. Step 1 is what makes that non-destructive.
 *   3. Drops the stale `guildId_1_discordId_1` unique index and builds the new one on `discordId`.
 *      Mongoose never drops indexes a schema stopped declaring, so leaving this would keep a unique
 *      constraint on a field the documents no longer have.
 *
 * Run it with the bot stopped. Step 2 and step 3 are not atomic with respect to a live writer, and
 * a credit landing between them would be lost.
 *
 * Re-running is safe: step 1 skips guild/member pairs already archived, and steps 2-3 are
 * idempotent.
 */
import mongoose from "mongoose";
import { connectDatabase } from "@database/connection";
import { Coin, LegacyCoin } from "@database/models";

const DRY_RUN = !process.argv.includes("--confirm");
const COIN_COLLECTION = "coins";
const STALE_INDEX = "guildId_1_discordId_1";

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
}

// The shared helper, not a bare mongoose.connect: it passes the connection options the rest of the
// system uses, and calling connect() without them trips a URL-parsing bug in Bun's mongodb driver.
await connectDatabase(uri);
console.log("");

// The live collection still has the old shape at this point, so read it raw rather than through the
// Coin model — the model has already been redefined without guildId and would not project it.
const raw = mongoose.connection.db!.collection<{
    _id: unknown;
    guildId?: string;
    discordId: string;
    username?: string;
    coins?: number;
}>(COIN_COLLECTION);

const existing = await raw.find({}).toArray();
const perGuild = existing.filter(row => typeof row.guildId === "string");
const totalCoins = perGuild.reduce((sum, row) => sum + (row.coins ?? 0), 0);
const holders = new Set(perGuild.map(row => row.discordId));

console.log(`${existing.length} coin document(s) found`);
console.log(`  ${perGuild.length} carry a guildId and will be archived`);
console.log(`  ${holders.size} distinct member(s), ${totalCoins} coins in total`);
console.log(`  every wallet will restart at 0\n`);

if (DRY_RUN) {
    const byGuild = new Map<string, { members: number; coins: number }>();
    for (const row of perGuild) {
        const entry = byGuild.get(row.guildId!) ?? { members: 0, coins: 0 };
        entry.members++;
        entry.coins += row.coins ?? 0;
        byGuild.set(row.guildId!, entry);
    }

    console.log("Claimable per guild once migrated (via /points migrate-coins):");
    for (const [guildId, { members, coins }] of [...byGuild].sort((a, b) => b[1].coins - a[1].coins)) {
        console.log(`  ${guildId}  ${String(members).padStart(5)} member(s)  ${coins} coins`);
    }

    console.log("\nDry run — nothing was changed. Re-run with --confirm to apply.");
    await mongoose.disconnect();
    process.exit(0);
}

// 1. Archive.
let archived = 0;
for (const row of perGuild) {
    const result = await LegacyCoin.updateOne(
        { guildId: row.guildId, discordId: row.discordId },
        {
            $setOnInsert: {
                guildId: row.guildId,
                discordId: row.discordId,
                username: row.username ?? "",
                coins: row.coins ?? 0,
                migratedAt: null,
            },
        },
        { upsert: true },
    );
    if (result.upsertedCount > 0) archived++;
}
console.log(`Archived ${archived} row(s) into legacycoins (${perGuild.length - archived} already present).`);

// 2. Empty the live wallet. Only after the archive exists.
const cleared = await raw.deleteMany({});
console.log(`Cleared ${cleared.deletedCount} document(s) from ${COIN_COLLECTION}.`);

// 3. Re-index.
const indexes = await raw.indexes();
if (indexes.some(index => index.name === STALE_INDEX)) {
    await raw.dropIndex(STALE_INDEX);
    console.log(`Dropped stale index ${STALE_INDEX}.`);
} else {
    console.log(`Stale index ${STALE_INDEX} not present.`);
}

await Coin.syncIndexes();
console.log("Rebuilt indexes for the global Coin schema.");

console.log("\nDone. Coins are global and start at zero.");
console.log("Each server can claim its archived balances once with /points migrate-coins.");

await mongoose.disconnect();
process.exit(0);
