import type { GuildMember } from "discord.js";
import { MinecraftConfigRepository } from "@database/repositories";

export interface PremiumTierSummary {
    tierId: string | null;
    tierName: string | null;
    level: number;
    homeLimit: number;
}

/**
 * The tier a member holds, resolved from the roles the bot already has in memory.
 *
 * <h2>Why this takes a member and not a Discord id</h2>
 *
 * A tier is a Discord role, so resolving one requires knowing which roles the member holds. The bot
 * is in the guild and has them cached; an id on its own would force a fetch. Taking the member
 * makes that explicit — a caller without one genuinely cannot answer the question, and should say
 * so rather than quietly reporting "no tier", which is indistinguishable from a real free player.
 *
 * <h2>Why the API has its own copy</h2>
 *
 * `PremiumService` resolves the same ladder for the game server, which has no Discord connection
 * and must fetch the roles over HTTP. The *ladder* is shared — both read `premiumTiers` from the
 * guild's config — and only the way the roles are obtained differs.
 */
export async function resolvePremiumTier(member: GuildMember): Promise<PremiumTierSummary> {
    const config = await MinecraftConfigRepository.get(member.guild.id);
    const tiers = config?.premiumTiers ?? [];
    const freeHomeLimit = config?.freeHomeLimit ?? 2;

    const matched = tiers
        .filter(tier => member.roles.cache.has(tier.discordRoleId))
        .sort((a, b) => b.level - a.level)[0];

    if (!matched) {
        return { tierId: null, tierName: null, level: 0, homeLimit: freeHomeLimit };
    }

    return {
        tierId: matched.id,
        tierName: matched.name,
        level: matched.level,
        homeLimit: matched.homeLimit,
    };
}

/** The free tier's limits, for a caller with no member to resolve against. */
export async function freeTierSummary(guildId: string): Promise<PremiumTierSummary> {
    const config = await MinecraftConfigRepository.get(guildId);
    return { tierId: null, tierName: null, level: 0, homeLimit: config?.freeHomeLimit ?? 2 };
}
