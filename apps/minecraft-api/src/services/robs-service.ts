import { ApiError, normaliseUuid, type SellLine, type SellResponse } from "@sdk";
import { RobsRepository, RobTransactionRepository } from "@database/repositories";
import { getItemPrices } from "@core/minecraft";

/**
 * **Robs** — the Minecraft currency.
 *
 * <h2>What changed, and why every method here is cheaper than the one it replaced</h2>
 *
 * The coin economy this replaced was keyed by Discord id, so every single call began by resolving a
 * UUID through `MinecraftLink` — a second indexed query on the hot path, and a hard failure
 * (`NOT_LINKED`) for anyone who had not linked Discord. Robs are keyed by the Minecraft UUID the
 * caller already holds, so:
 *
 * <ul>
 *   <li>a balance read is one query rather than two;</li>
 *   <li>an unlinked player has a working economy instead of an error;</li>
 *   <li>the leaderboard needs no link table at all, because the display name lives on the row.</li>
 * </ul>
 *
 * `guildId` is still carried on the write paths, because the audit trail and the price table are
 * per-guild. It no longer scopes a balance: robs are global to the network, exactly as coins were.
 *
 * Robs are never converted to or from Discord coins, and nothing in this file reads the `Coin`
 * collection.
 */
export class RobsService {
    /** One player's balance. Zero for a player who has never earned anything, never an error. */
    static async balance(uuid: string): Promise<{ uuid: string; username: string; robs: number; discordId: string | null }> {
        const normalised = normaliseUuid(uuid);
        const record = await RobsRepository.get(normalised);

        return {
            uuid: normalised,
            username: record?.username ?? "unknown",
            robs: record?.robs ?? 0,
            discordId: record?.discordId ?? null,
        };
    }

    /**
     * Many balances in one query.
     *
     * Every requested uuid comes back, including ones with no row — the caller asked about a
     * specific set of players and silently dropping the unknown ones would make the response
     * impossible to line up with the request.
     */
    static async balances(uuids: string[]): Promise<Array<{ uuid: string; username: string; robs: number; discordId: string | null }>> {
        const normalised = uuids.map(normaliseUuid);
        const rows = await RobsRepository.getMany(normalised);
        const byUuid = new Map(rows.map(row => [row.minecraftUuid, row]));

        return normalised.map(uuid => {
            const record = byUuid.get(uuid);
            return {
                uuid,
                username: record?.username ?? "unknown",
                robs: record?.robs ?? 0,
                discordId: record?.discordId ?? null,
            };
        });
    }

    static async credit(
        uuid: string,
        username: string,
        amount: number,
    ): Promise<{ uuid: string; robs: number; applied: number }> {
        if (amount <= 0) throw ApiError.validation({ amount: "must be greater than zero" });

        const normalised = normaliseUuid(uuid);
        const updated = await RobsRepository.addRobs(normalised, username, amount);

        return { uuid: normalised, robs: updated.robs, applied: amount };
    }

    /**
     * Debits a balance, refusing to take a player negative.
     *
     * The balance check is inside the update rather than a read before it. Two servers debiting the
     * same player at the same moment would otherwise both pass a separate check and both apply,
     * leaving a negative balance the economy has no way to recover from.
     */
    static async debit(
        uuid: string,
        username: string,
        amount: number,
    ): Promise<{ uuid: string; robs: number; applied: number }> {
        if (amount <= 0) throw ApiError.validation({ amount: "must be greater than zero" });

        const normalised = normaliseUuid(uuid);
        const updated = await RobsRepository.tryDebit(normalised, username, amount);
        if (!updated) throw ApiError.insufficientFunds();

        return { uuid: normalised, robs: updated.robs, applied: -amount };
    }

    /**
     * Settles a completed in-game sale.
     *
     * The plugin has already removed the items before calling — that ordering is deliberate and
     * documented on the plugin side, so a failure here costs the player the sale rather than paying
     * them for items they still hold. Prices are re-read here rather than trusted from the request,
     * so a tampered client cannot name its own price.
     */
    static async sell(input: {
        guildId: string;
        uuid: string;
        username: string;
        serverId: string;
        lines: SellLine[];
    }): Promise<SellResponse> {
        const uuid = normaliseUuid(input.uuid);

        const prices = await getItemPrices(input.guildId);
        const byKey = new Map(prices.map(price => [price.itemKey, price]));

        const priced = input.lines.map(line => {
            const price = byKey.get(line.itemKey.toUpperCase());
            if (!price || !price.enabled) {
                throw ApiError.conflict(`${line.itemKey} cannot be sold right now`);
            }
            if (line.amount <= 0) {
                throw ApiError.validation({ [`lines.${line.itemKey}`]: "amount must be greater than zero" });
            }
            return { ...line, unitPrice: price.price, robs: price.price * line.amount };
        });

        const credited = priced.reduce((total, line) => total + line.robs, 0);
        const updated = await RobsRepository.addRobs(uuid, input.username, credited);

        await Promise.all(
            priced.map(line =>
                RobTransactionRepository.record({
                    guildId: input.guildId,
                    minecraftUuid: uuid,
                    minecraftUsername: input.username,
                    // Copied from the balance row rather than looked up: the link table is not on
                    // this path, and a null here only means "not linked", which is not an error.
                    discordId: updated.discordId ?? null,
                    itemKey: line.itemKey,
                    amount: line.amount,
                    robs: line.robs,
                    unitPrice: line.unitPrice,
                    serverKey: input.serverId,
                }),
            ),
        );

        return {
            uuid,
            robs: updated.robs,
            credited,
            duplicate: false,
            lines: priced,
        };
    }

    /**
     * The robs leaderboard.
     *
     * No link table is consulted. The Minecraft username is stored on the balance row and refreshed
     * on every mutation, so the ranking is already in the terms the game server wants to print —
     * and unlinked players appear in it, which under the coin economy they never could.
     */
    static async leaderboard(
        limit: number,
        uuid?: string,
    ): Promise<{
        entries: Array<{ position: number; uuid: string; username: string; robs: number }>;
        player: { position: number; robs: number } | null;
    }> {
        const top = await RobsRepository.getTop(limit);

        const entries = top.map((row, index) => ({
            position: index + 1,
            uuid: row.minecraftUuid,
            username: row.username,
            robs: row.robs,
        }));

        if (!uuid) return { entries, player: null };

        const normalised = normaliseUuid(uuid);
        const [position, record] = await Promise.all([
            RobsRepository.getRank(normalised),
            RobsRepository.get(normalised),
        ]);

        return { entries, player: { position, robs: record?.robs ?? 0 } };
    }

    static async history(input: {
        guildId: string;
        uuid?: string;
        limit: number;
        offset: number;
    }): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
        const uuid = input.uuid ? normaliseUuid(input.uuid) : undefined;

        const [rows, total] = await Promise.all([
            RobTransactionRepository.list(input.guildId, uuid, input.limit, input.offset),
            RobTransactionRepository.count(input.guildId, uuid),
        ]);

        return {
            items: rows.map(row => ({
                itemKey: row.itemKey,
                amount: row.amount,
                robs: row.robs,
                unitPrice: row.unitPrice,
                serverId: row.serverKey,
                username: row.minecraftUsername,
                createdAt: row.createdAt.toISOString(),
            })),
            total,
        };
    }
}
