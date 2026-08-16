import { PremiumRepository, type PremiumMutation } from "@database/repositories";
import { PREMIUM_CONFIG } from "@constants";
import { Logger } from "@logger";
import { getPremiumFeature } from "./features/registry";
import {
    resolveBenefits,
    type GlobalPremiumConfig,
    type PremiumBenefits,
    type PremiumTierView,
} from "./resolve-benefits";

const CTX = "premium";

/**
 * How the engine learns which Discord roles a member holds.
 *
 * The only role read in the system. Everything else asks about *benefits*, so changing how premium
 * is granted is a change here and nowhere else. With no provider registered — the API process, a
 * test — role-granted tiers simply resolve to nothing, while global memberships still apply.
 */
type RoleProvider = (guildId: string, discordId: string) => Promise<readonly string[]> | readonly string[];

let roleProvider: RoleProvider | null = null;

export function setPremiumRoleProvider(provider: RoleProvider | null): void {
    roleProvider = provider;
}

// ── Caches ───────────────────────────────────────────────────────────────────

/**
 * Three caches, because the data has three different lifetimes.
 *
 * The tier ladder is global and changes almost never; a guild's role map changes when an admin
 * edits it; a member's resolved benefits change when their roles or memberships do. Caching them
 * together would mean one operator edit dropped every member in every guild.
 */
let globalConfig: { config: GlobalPremiumConfig; expiresAt: number } | null = null;

const roleMapCache = new Map<string, { map: Map<string, string>; enabled: boolean; expiresAt: number }>();
const memberCache = new Map<string, { benefits: PremiumBenefits; expiresAt: number }>();

const memberKey = (guildId: string, discordId: string) => `${guildId}:${discordId}`;

async function loadGlobalConfig(): Promise<GlobalPremiumConfig> {
    if (globalConfig && globalConfig.expiresAt > Date.now()) return globalConfig.config;

    const [tiers, values] = await Promise.all([
        PremiumRepository.listTiers(),
        PremiumRepository.listValues(),
    ]);

    const config: GlobalPremiumConfig = { tiers, values };
    globalConfig = { config, expiresAt: Date.now() + PREMIUM_CONFIG.configCacheMs };
    return config;
}

/** roleId → tierKey for one guild, plus that guild's premium switch. */
async function loadGuildRoles(guildId: string): Promise<{ map: Map<string, string>; enabled: boolean }> {
    const hit = roleMapCache.get(guildId);
    if (hit && hit.expiresAt > Date.now()) return hit;

    const [rows, settings] = await Promise.all([
        PremiumRepository.listRoleMaps(guildId),
        PremiumRepository.getSettings(guildId),
    ]);

    const entry = {
        map: new Map(rows.map(row => [row.roleId, row.tierKey])),
        enabled: settings.enabled,
        expiresAt: Date.now() + PREMIUM_CONFIG.configCacheMs,
    };

    roleMapCache.set(guildId, entry);
    return entry;
}

export function invalidatePremiumGlobal(): void {
    globalConfig = null;
    memberCache.clear();
}

export function invalidatePremiumGuild(guildId: string): void {
    roleMapCache.delete(guildId);

    const prefix = `${guildId}:`;
    for (const key of memberCache.keys()) {
        if (key.startsWith(prefix)) memberCache.delete(key);
    }
}

/** A member's memberships or roles changed — drop them in every guild. */
export function invalidatePremiumMember(discordId: string, guildId?: string): void {
    if (guildId) {
        memberCache.delete(memberKey(guildId, discordId));
        return;
    }

    const suffix = `:${discordId}`;
    for (const key of memberCache.keys()) {
        if (key.endsWith(suffix)) memberCache.delete(key);
    }
}

export function clearPremiumCache(): void {
    globalConfig = null;
    roleMapCache.clear();
    memberCache.clear();
}

export function premiumCacheSize(): { members: number; guilds: number } {
    return { members: memberCache.size, guilds: roleMapCache.size };
}

/** Wired once at boot, so no write path has to remember to invalidate. */
export function startPremiumEngine(): () => void {
    return PremiumRepository.onMutation((mutation: PremiumMutation) => {
        if (mutation.scope === "global") invalidatePremiumGlobal();
        else if (mutation.scope === "guild") invalidatePremiumGuild(mutation.guildId);
        else invalidatePremiumMember(mutation.discordId);
    });
}

// ── The API ──────────────────────────────────────────────────────────────────

async function resolve(guildId: string, discordId: string, roleIds: readonly string[]): Promise<PremiumBenefits> {
    const [config, guild, memberships] = await Promise.all([
        loadGlobalConfig(),
        loadGuildRoles(guildId),
        PremiumRepository.listMemberships(discordId),
    ]);

    return resolveBenefits(config, {
        membershipTiers: memberships.map(row => ({ tierKey: row.tierKey, expiresAt: row.expiresAt })),
        roleTiers: roleIds.map(roleId => guild.map.get(roleId)).filter((key): key is string => Boolean(key)),
        guildEnabled: guild.enabled,
    });
}

/**
 * Resolves benefits from roles the caller already holds.
 *
 * The cheap path for anything with a GuildMember in hand — skips the role provider, but still reads
 * the member's global memberships, because those apply whether or not this server maps a role.
 */
export async function benefitsForRoles(
    guildId: string,
    discordId: string,
    roleIds: readonly string[],
): Promise<PremiumBenefits> {
    return resolve(guildId, discordId, roleIds);
}

/**
 * Everything premium about a member, cached.
 *
 * The method the rest of the bot reaches for. Safe on a hot path: a miss costs a role lookup in the
 * gateway's resident cache and, at most, one configuration read per minute.
 */
export async function getBenefits(guildId: string, discordId: string): Promise<PremiumBenefits> {
    const key = memberKey(guildId, discordId);
    const hit = memberCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.benefits;

    let roleIds: readonly string[] = [];

    if (roleProvider) {
        try {
            roleIds = await roleProvider(guildId, discordId);
        } catch (err) {
            // A departed member or a gateway hiccup. Falling back to memberships alone is safe: it
            // grants nothing that was not owned, and the entry expires in seconds.
            Logger.debug(`Could not read roles for ${discordId} in ${guildId}: ${err}`, CTX);
        }
    }

    const benefits = await resolve(guildId, discordId, roleIds);

    if (memberCache.size >= PREMIUM_CONFIG.memberCacheMax) {
        const oldest = memberCache.keys().next().value;
        if (oldest) memberCache.delete(oldest);
    }

    memberCache.set(key, { benefits, expiresAt: Date.now() + PREMIUM_CONFIG.memberCacheMs });
    return benefits;
}

/** True when a flag feature is granted, or a numeric one resolves above zero. */
export async function hasFeature(guildId: string, discordId: string, feature: string): Promise<boolean> {
    const value = (await getBenefits(guildId, discordId)).values[feature];
    return typeof value === "boolean" ? value : (value ?? 0) > 0;
}

/** The numeric value of a feature — percent, count, or duration in hours, per its definition. */
export async function getFeatureValue(guildId: string, discordId: string, feature: string): Promise<number> {
    const value = (await getBenefits(guildId, discordId)).values[feature];
    if (typeof value === "number") return value;
    return value ? 1 : 0;
}

/**
 * A percent feature as a multiplier: 10 becomes 1.1.
 *
 * Consumers multiply rather than branch, so a member with no premium multiplies by exactly 1 and
 * the arithmetic is unchanged from before the engine existed.
 */
export async function getMultiplier(guildId: string, discordId: string, feature: string): Promise<number> {
    const def = getPremiumFeature(feature);
    if (def?.type !== "percent") return 1;

    return 1 + (await getFeatureValue(guildId, discordId, feature)) / 100;
}

/** A duration feature in milliseconds. Values are stored in hours, because that is what admins type. */
export async function getDurationMs(guildId: string, discordId: string, feature: string): Promise<number> {
    const def = getPremiumFeature(feature);
    if (def?.type !== "duration") return 0;

    return (await getFeatureValue(guildId, discordId, feature)) * 60 * 60 * 1000;
}

export async function getHighestTier(guildId: string, discordId: string): Promise<PremiumTierView | null> {
    return (await getBenefits(guildId, discordId)).tier;
}

/** This guild's role → tier mappings, for the config command and for audits. */
export async function getPremiumRoles(guildId: string): Promise<{ roleId: string; tierKey: string }[]> {
    const guild = await loadGuildRoles(guildId);
    return [...guild.map].map(([roleId, tierKey]) => ({ roleId, tierKey }));
}

/** The global ladder. Same answer in every guild — that is the point of the system. */
export async function getPremiumTiers(): Promise<PremiumTierView[]> {
    const config = await loadGlobalConfig();
    return config.tiers.map(tier => ({
        key: tier.key,
        name: tier.name,
        rank: tier.rank,
        emoji: tier.emoji,
        color: tier.color,
    }));
}

export async function getGlobalPremiumConfig(): Promise<GlobalPremiumConfig> {
    return loadGlobalConfig();
}
