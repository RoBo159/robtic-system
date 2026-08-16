import { QuestClaimRepository } from "@database/repositories";
import { isFeatureEnabled } from "@core/features";
import { QUEST_CONFIG } from "@constants";
import { Logger } from "@logger";
import { toRuntime, type ClaimRuntime } from "./runtime";

const CTX = "quests";

interface CacheEntry {
    /** Null is a *negative* entry: we checked, and this member holds nothing. */
    claims: ClaimRuntime[] | null;
    expiresAt: number;
}

/**
 * Which live claims each member holds.
 *
 * The negative entry is the load-bearing part. Almost every member holds no quest, and the intake
 * path runs on every message in every guild — rediscovering "nothing to do" with a query each time
 * is exactly the cost this exists to avoid. A metric for an uninvolved member is one Map miss.
 *
 * Process-local, which assumes a member's claims and their metric events are handled by the same
 * process. That holds under guild sharding; a separate worker mutating claims would need positive
 * entries to expire on a TTL too.
 */
const cache = new Map<string, CacheEntry>();

/** Members currently being loaded, so a burst of messages triggers one query rather than twenty. */
const inFlight = new Set<string>();

const keyOf = (guildId: string, discordId: string): string => `${guildId}:${discordId}`;

/** The cached claims, or undefined when this member has never been looked up. */
export function peekClaims(guildId: string, discordId: string): ClaimRuntime[] | null | undefined {
    const key = keyOf(guildId, discordId);
    const entry = cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return undefined;
    }

    // Refresh recency for the LRU trim: re-inserting moves it to the end of the Map's order.
    cache.delete(key);
    cache.set(key, entry);

    return entry.claims;
}

/**
 * Loads a member's claims into the cache.
 *
 * Fire-and-forget from the synchronous intake path. `onLoaded` receives the freshly built runtimes
 * so the caller can replay the metric that triggered the load — otherwise the very message that
 * made someone claim would be the one message that did not count.
 */
export function fillClaims(
    guildId: string,
    discordId: string,
    onLoaded?: (claims: ClaimRuntime[]) => void,
): void {
    const key = keyOf(guildId, discordId);
    if (inFlight.has(key)) return;
    inFlight.add(key);

    void (async () => {
        try {
            if (!(await isFeatureEnabled(guildId, "quests"))) {
                // The answer cannot change while the feature is off, so trust it for longer.
                store(key, { claims: null, expiresAt: Date.now() + QUEST_CONFIG.disabledCacheMs });
                return;
            }

            const rows = await QuestClaimRepository.findActiveForMember(guildId, discordId);
            if (rows.length === 0) {
                store(key, { claims: null, expiresAt: Date.now() + QUEST_CONFIG.negativeCacheMs });
                return;
            }

            const claims = rows.map(toRuntime);
            // Positive entries live until the earliest claim ends; after that a re-read is required
            // anyway to see whether it expired or completed.
            const soonest = Math.min(...claims.map(claim => claim.expiresAt));
            store(key, { claims, expiresAt: soonest });

            onLoaded?.(claims);
        } catch (err) {
            Logger.warn(`Could not load quest claims for ${discordId} in ${guildId}: ${err}`, CTX);
        } finally {
            inFlight.delete(key);
        }
    })();
}

function store(key: string, entry: CacheEntry): void {
    cache.set(key, entry);

    // A guild where everyone holds a VIP quest is the only unbounded axis in the design. Lazy
    // filling means this tracks active talkers rather than claim count, and the cap stops a raid
    // from turning that into memory pressure. An evicted member simply re-fills on their next event.
    if (cache.size > QUEST_CONFIG.claimCacheMax) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
}

/** Drops a member, so their next event re-reads. Called from every write that changes their claims. */
export function invalidateMemberClaims(guildId: string, discordId: string): void {
    cache.delete(keyOf(guildId, discordId));
}

/** Drops a whole guild — the feature was turned off, or the bot left. */
export function forgetGuildClaims(guildId: string): void {
    const prefix = `${guildId}:`;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) cache.delete(key);
    }
}

/** Inserts a freshly created claim without a round trip, since the caller already has it. */
export function primeClaim(runtime: ClaimRuntime): void {
    const key = keyOf(runtime.guildId, runtime.discordId);
    const existing = cache.get(key);
    const claims = existing?.claims ? [...existing.claims, runtime] : [runtime];
    const soonest = Math.min(...claims.map(claim => claim.expiresAt));

    store(key, { claims, expiresAt: soonest });
}

export function cachedMemberCount(): number {
    return cache.size;
}

export function clearClaimCache(): void {
    cache.clear();
    inFlight.clear();
}
