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

    /**
     * The coin leaderboard, resolved to Minecraft names.
     *
     * Balances are keyed by Discord id, but the callers that want a ranking — TAB, a holographic
     * scoreboard, the in-game placeholders — can only display a Minecraft name, so the links are
     * resolved here in one query rather than leaving each caller to make N of them. An entry whose
     * holder has never linked keeps its Discord username, because dropping it would silently
     * renumber everyone below it.
     */
    static async leaderboard(
        guildId: string,
        limit: number,
        uuid?: string,
    ): Promise<{
        entries: Array<{ position: number; discordId: string; username: string; uuid: string | null; coins: number }>;
        player: { position: number; coins: number } | null;
    }> {
        const top = await CoinsRepository.getTop(guildId, limit);

        const links = await MinecraftLinkRepository.listByDiscordIds(
            guildId,
            top.map(row => row.discordId),
        );
        const byDiscordId = new Map(links.map(link => [link.discordId, link]));

        const entries = top.map((row, index) => {
            const link = byDiscordId.get(row.discordId);
            return {
                position: index + 1,
                discordId: row.discordId,
                username: link?.minecraftUsername ?? row.username,
                uuid: link?.minecraftUuid ?? null,
                coins: row.coins,
            };
        });

        if (!uuid) return { entries, player: null };

        const link = await MinecraftLinkRepository.getByUuid(guildId, normaliseUuid(uuid));
        if (!link) return { entries, player: null };

        const [position, record] = await Promise.all([
            CoinsRepository.getRank(guildId, link.discordId),
            CoinsRepository.get(guildId, link.discordId),
        ]);

        return { entries, player: { position, coins: record?.coins ?? 0 } };
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
