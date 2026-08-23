import {
    MinecraftFriendRepository,
    MinecraftHomeRepository,
    MinecraftJailRepository,
    MinecraftLinkRepository,
    MinecraftPlayerStatsRepository,
    MinecraftServerRepository,
    RobsRepository,
    RobTransactionRepository,
    type RobSaleTotals,
} from "@database/repositories";
import type { IRobTransaction } from "@database/models/RobTransaction";
import type { GuildMember } from "discord.js";
import { freeTierSummary, resolvePremiumTier, type PremiumTierSummary } from "./resolve-premium-tier";

export interface MinecraftProfile {
    linked: boolean;
    minecraftUuid?: string;
    minecraftUsername?: string;
    linkedAt?: Date;
    lastSeenAt?: Date;

    /** The player's **robs** — the Minecraft currency. Never their Discord coins. */
    robs: number;

    premium: PremiumTierSummary;

    playtimeMs: number;
    firstJoinAt?: Date;
    kills: number;
    deaths: number;

    jailed: boolean;
    /** Milliseconds left to serve; null for a permanent sentence or none at all. */
    jailRemainingMs: number | null;
    jailCount: number;

    /**
     * How many homes exist and how many are allowed.
     *
     * Deliberately a count and a limit, never the homes themselves. A Discord embed must not be
     * able to reveal where somebody has built — see the note on the model.
     */
    homesUsed: number;
    homeLimit: number;

    friendCount: number;

    totals: RobSaleTotals;
    recentSales: IRobTransaction[];
}

/**
 * Everything `/minecraft profile` renders.
 *
 * <h2>Home coordinates never appear here</h2>
 *
 * Only `homesUsed` and `homeLimit` are read. That is not an omission to be tidied up later: a base
 * location leaked into a Discord channel is a real harm to the player, and the boundary is easiest
 * to keep if the coordinates never enter this function at all.
 *
 * Zeroed rather than empty for an unlinked member. Without a link there is no Minecraft account to
 * report on from Discord's side — the player still exists in game, they are simply not reachable
 * from a Discord id, which is the whole consequence of keying everything by UUID.
 */
export async function getMinecraftProfile(
    guildId: string,
    discordId: string,
    /**
     * The member, when the caller has one. Required to report a premium tier — see
     * `resolvePremiumTier` — and reported as free when absent rather than guessed at.
     */
    member: GuildMember | null = null,
    recentLimit = 5,
): Promise<MinecraftProfile> {
    const link = await MinecraftLinkRepository.getByDiscordId(guildId, discordId);

    if (!link) {
        return {
            linked: false,
            robs: 0,
            premium: await freeTierSummary(guildId),
            playtimeMs: 0,
            kills: 0,
            deaths: 0,
            jailed: false,
            jailRemainingMs: null,
            jailCount: 0,
            homesUsed: 0,
            homeLimit: 0,
            friendCount: 0,
            totals: { transactions: 0, items: 0, robs: 0 },
            recentSales: [],
        };
    }

    const uuid = link.minecraftUuid;

    /**
     * Homes are per-server, and Discord has no server context — so the guild's first registered
     * server is reported on.
     *
     * That is exact for the single-survival-server case this is built for, and clearly stated
     * rather than silently summing across servers, which would compare a total against a per-server
     * limit and read as "8/5 homes".
     */
    const servers = await MinecraftServerRepository.list(guildId);
    const serverKey = servers[0]?.serverKey ?? "";

    const [robRecord, stats, premium, jail, homesUsed, friendCount, totals, recentSales] = await Promise.all([
        RobsRepository.get(uuid),
        MinecraftPlayerStatsRepository.get(uuid),
        member ? resolvePremiumTier(member) : freeTierSummary(guildId),
        MinecraftJailRepository.findActive(guildId, uuid),
        serverKey ? MinecraftHomeRepository.count(uuid, serverKey) : Promise.resolve(0),
        MinecraftFriendRepository.countFriends(uuid),
        RobTransactionRepository.totals(guildId, uuid),
        RobTransactionRepository.listByUuid(guildId, uuid, recentLimit),
    ]);

    return {
        linked: true,
        minecraftUuid: uuid,
        minecraftUsername: link.minecraftUsername,
        linkedAt: link.linkedAt,
        lastSeenAt: stats?.lastSeenAt ?? link.lastSeenAt ?? undefined,

        robs: robRecord?.robs ?? 0,
        premium,

        playtimeMs: stats?.playtimeMs ?? 0,
        firstJoinAt: stats?.firstJoinAt,
        kills: stats?.kills ?? 0,
        deaths: stats?.deaths ?? 0,

        jailed: Boolean(jail),
        // Null for a permanent sentence: "forever" and "time served" must not render the same.
        jailRemainingMs: jail?.releaseAt ? Math.max(0, jail.releaseAt.getTime() - Date.now()) : null,
        jailCount: stats?.jailCount ?? 0,

        homesUsed,
        homeLimit: premium.homeLimit,

        friendCount,

        totals,
        recentSales,
    };
}
