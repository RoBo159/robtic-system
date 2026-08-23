import { normaliseUuid, type PremiumEntitlements } from "@sdk";
import { MinecraftConfigRepository, MinecraftLinkRepository } from "@database/repositories";
import type { IMinecraftConfig } from "@database/models/MinecraftConfig";
import { TtlCache } from "../lib/ttl-cache";
import { DiscordRoleService } from "./discord-role-service";

/**
 * Resolves a player's premium tier, and with it every limit the survival features enforce.
 *
 * <h2>Premium is the one thing Discord still decides</h2>
 *
 * A staff rank is a LuckPerms group the game server owns, mirrored outwards to Discord. Premium is
 * the opposite: it is bought and managed on Discord, so the role is genuinely the source and the
 * LuckPerms group follows it.
 *
 * The two never collide because the sets are disjoint — the staff mirror only touches role ids
 * named in roles.yml, and premium sync only touches the groups named in premium.yml. Keeping them
 * that way is a configuration rule, and it is worth stating: putting a staff rank's group in a
 * premium tier would make the two write the same state again.
 *
 * <h2>Every limit lives here</h2>
 *
 * Homes, `/back` uses, locked chests, the portable chest and the cosmetics all read their limit
 * from {@link entitlementsOf}. No feature carries its own copy, so raising a tier's home limit is
 * one edit rather than four.
 */

/**
 * How long a resolved tier is trusted.
 *
 * Matches the plugin's own premium cache. Long enough that a full server's join burst does not
 * become a Discord call per player, short enough that a cancelled subscription stops working
 * within the half hour rather than at the next restart.
 */
const ENTITLEMENT_TTL_MS = 30 * 60 * 1000;

const cache = new TtlCache<PremiumEntitlements>(ENTITLEMENT_TTL_MS);

/** What a player with no premium role gets. Limits still come from config, not from constants. */
function freeTier(config: IMinecraftConfig | null): PremiumEntitlements {
    return {
        tierId: null,
        tierName: null,
        level: 0,
        homeLimit: config?.freeHomeLimit ?? 2,
        backUses: 0,
        lockedChestLimit: 0,
        portableChest: false,
        cosmetics: false,
        luckPermsGroup: null,
    };
}

export class PremiumService {
    /**
     * The tier a player currently holds.
     *
     * An unlinked player is free by definition — premium is a Discord role, and without a link
     * there is no member to read roles from. That is an ordinary answer, not a failure.
     */
    static async entitlementsOf(guildId: string, uuid: string): Promise<PremiumEntitlements> {
        const normalised = normaliseUuid(uuid);
        const key = `${guildId}:${normalised}`;

        const cached = cache.get(key);
        if (cached) return cached;

        const config = await MinecraftConfigRepository.get(guildId);
        const tiers = config?.premiumTiers ?? [];

        if (tiers.length === 0) {
            const free = freeTier(config);
            cache.set(key, free);
            return free;
        }

        const link = await MinecraftLinkRepository.getByUuid(guildId, normalised);
        if (!link) {
            const free = freeTier(config);
            cache.set(key, free);
            return free;
        }

        const held = await DiscordRoleService.rolesOf(guildId, link.discordId);

        // Null means Discord could not be reached. Caching "free" then would silently strip a
        // paying player's benefits for half an hour, so the answer is returned uncached instead.
        if (!held) return freeTier(config);

        const matched = tiers
            .filter(tier => held.includes(tier.discordRoleId))
            .sort((a, b) => b.level - a.level)[0];

        const resolved: PremiumEntitlements = matched
            ? {
                  tierId: matched.id,
                  tierName: matched.name,
                  level: matched.level,
                  homeLimit: matched.homeLimit,
                  backUses: matched.backUses,
                  lockedChestLimit: matched.lockedChestLimit,
                  portableChest: matched.portableChest,
                  cosmetics: matched.cosmetics,
                  luckPermsGroup: matched.luckPermsGroup,
              }
            : freeTier(config);

        cache.set(key, resolved);
        return resolved;
    }

    /** Every premium LuckPerms group this guild manages, so the plugin can revoke the others. */
    static async managedGroups(guildId: string): Promise<string[]> {
        const config = await MinecraftConfigRepository.get(guildId);
        return [...new Set((config?.premiumTiers ?? []).map(tier => tier.luckPermsGroup))];
    }

    /** The `/back` window length for this guild. */
    static async backWindowMs(guildId: string): Promise<number> {
        const config = await MinecraftConfigRepository.get(guildId);
        return config?.backWindowMs ?? 4 * 60 * 60 * 1000;
    }

    /** Drops a player's cached tier, so a premium change applies without waiting out the TTL. */
    static invalidate(guildId: string, uuid: string): void {
        cache.invalidate(`${guildId}:${normaliseUuid(uuid)}`);
    }
}
