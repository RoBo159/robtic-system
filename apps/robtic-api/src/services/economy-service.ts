import { ApiError, normaliseUuid, type SellLine, type SellResponse } from "@sdk";
import {
    CoinsRepository,
    MinecraftLinkRepository,
    MinecraftTransactionRepository,
} from "@database/repositories";
import { getItemPrices } from "@core/minecraft";

/**
 * The shared coin economy.
 *
 * Balances live in the same `coins` collection Discord awards from, so a coin earned in chat and a
 * coin earned mining are the same coin. Every mutation is an `$inc`, never a read-modify-write,
 * which is what lets Discord and several game servers credit the same member concurrently.
 */
export class EconomyService {
    /** Resolves a player reference to the Discord id the balance is keyed by. */
    private static async resolveDiscordId(
        guildId: string,
        ref: { uuid?: string; discordId?: string },
    ): Promise<{ discordId: string; username: string }> {
        if (ref.discordId) {
            const link = await MinecraftLinkRepository.getByDiscordId(guildId, ref.discordId);
            return { discordId: ref.discordId, username: link?.minecraftUsername ?? ref.discordId };
        }

        if (!ref.uuid) throw ApiError.validation({ uuid: "either uuid or discordId is required" });

        const link = await MinecraftLinkRepository.getByUuid(guildId, normaliseUuid(ref.uuid));
        if (!link) throw ApiError.notLinked();

        return { discordId: link.discordId, username: link.minecraftUsername };
    }

    static async balance(guildId: string, uuid: string): Promise<{ uuid: string; discordId: string; coins: number }> {
        const normalised = normaliseUuid(uuid);
        const link = await MinecraftLinkRepository.getByUuid(guildId, normalised);
        if (!link) throw ApiError.notLinked();

        const record = await CoinsRepository.get(guildId, link.discordId);
        return { uuid: normalised, discordId: link.discordId, coins: record?.coins ?? 0 };
    }

    static async credit(
        guildId: string,
        ref: { uuid?: string; discordId?: string },
        amount: number,
    ): Promise<{ discordId: string; coins: number; applied: number }> {
        if (amount <= 0) throw ApiError.validation({ amount: "must be greater than zero" });

        const { discordId, username } = await this.resolveDiscordId(guildId, ref);
        const updated = await CoinsRepository.addCoins(guildId, discordId, username, amount);

        return { discordId, coins: updated.coins, applied: amount };
    }

    /**
     * Debits a balance. The current value is checked first and the debit refuses to take a member
     * negative — the economy has no credit facility, and a negative balance would be unrecoverable
     * without manual repair.
     */
    static async debit(
        guildId: string,
        ref: { uuid?: string; discordId?: string },
        amount: number,
    ): Promise<{ discordId: string; coins: number; applied: number }> {
        if (amount <= 0) throw ApiError.validation({ amount: "must be greater than zero" });

        const { discordId, username } = await this.resolveDiscordId(guildId, ref);

        const current = await CoinsRepository.get(guildId, discordId);
        if ((current?.coins ?? 0) < amount) throw ApiError.insufficientFunds();

        const updated = await CoinsRepository.addCoins(guildId, discordId, username, -amount);
        return { discordId, coins: updated.coins, applied: -amount };
    }

    /**
     * Settles a completed in-game sale.
     *
     * The plugin has already removed the items before calling — that ordering is deliberate and
     * documented on the plugin side, so a failure here costs the player the sale rather than
     * paying them for items they still hold. Prices are re-read here rather than trusted from the
     * request, so a tampered client cannot name its own price.
     */
    static async sell(input: {
        guildId: string;
        uuid: string;
        username: string;
        serverId: string;
        lines: SellLine[];
    }): Promise<SellResponse> {
        const link = await MinecraftLinkRepository.getByUuid(input.guildId, normaliseUuid(input.uuid));
        if (!link) throw ApiError.notLinked();

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
            return { ...line, unitPrice: price.price, coins: price.price * line.amount };
        });

        const credited = priced.reduce((total, line) => total + line.coins, 0);
        const updated = await CoinsRepository.addCoins(input.guildId, link.discordId, link.minecraftUsername, credited);

        for (const line of priced) {
            await MinecraftTransactionRepository.record({
                guildId: input.guildId,
                discordId: link.discordId,
                minecraftUuid: link.minecraftUuid,
                minecraftUsername: input.username,
                itemKey: line.itemKey,
                amount: line.amount,
                coins: line.coins,
                unitPrice: line.unitPrice,
                serverKey: input.serverId,
            });
        }

        return {
            discordId: link.discordId,
            coins: updated.coins,
            credited,
            duplicate: false,
            lines: priced,
        };
    }

    static async history(input: {
        guildId: string;
        uuid?: string;
        discordId?: string;
        limit: number;
        offset: number;
    }): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
        let discordId = input.discordId;

        if (!discordId && input.uuid) {
            const link = await MinecraftLinkRepository.getByUuid(input.guildId, normaliseUuid(input.uuid));
            if (!link) throw ApiError.notLinked();
            discordId = link.discordId;
        }

        const rows = await MinecraftTransactionRepository.list(input.guildId, discordId, input.limit, input.offset);
        const total = await MinecraftTransactionRepository.count(input.guildId, discordId);

        return {
            items: rows.map(row => ({
                itemKey: row.itemKey,
                amount: row.amount,
                coins: row.coins,
                unitPrice: row.unitPrice,
                serverId: row.serverKey,
                username: row.minecraftUsername,
                createdAt: row.createdAt.toISOString(),
            })),
            total,
        };
    }
}
