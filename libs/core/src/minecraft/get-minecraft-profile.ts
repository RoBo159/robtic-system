import {
    MinecraftLinkRepository,
    MinecraftTransactionRepository,
    CoinsRepository,
    type MinecraftSaleTotals,
} from "@database/repositories";
import type { IMinecraftTransaction } from "@database/models/MinecraftTransaction";

export interface MinecraftProfile {
    linked: boolean;
    minecraftUuid?: string;
    minecraftUsername?: string;
    linkedAt?: Date;
    lastSeenAt?: Date;
    /** Balance from the shared Coin collection — Minecraft never holds its own. */
    coins: number;
    totals: MinecraftSaleTotals;
    recentSales: IMinecraftTransaction[];
}

/** Everything `/minecraft profile` renders: link state, shared balance, and sale history. */
export async function getMinecraftProfile(
    guildId: string,
    discordId: string,
    recentLimit = 5,
): Promise<MinecraftProfile> {
    const [link, coinRecord, totals, recentSales] = await Promise.all([
        MinecraftLinkRepository.getByDiscordId(guildId, discordId),
        CoinsRepository.get(discordId),
        MinecraftTransactionRepository.totals(guildId, discordId),
        MinecraftTransactionRepository.listByUser(guildId, discordId, recentLimit),
    ]);

    return {
        linked: Boolean(link),
        minecraftUuid: link?.minecraftUuid,
        minecraftUsername: link?.minecraftUsername,
        linkedAt: link?.linkedAt,
        lastSeenAt: link?.lastSeenAt ?? undefined,
        coins: coinRecord?.coins ?? 0,
        totals,
        recentSales,
    };
}
