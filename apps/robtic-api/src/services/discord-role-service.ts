import { Logger } from "@logger";
import { TtlCache } from "../lib/ttl-cache";
import { mainBotToken } from "../lib/bot-token";

const CTX = "robtic-api";
const DISCORD_API = "https://discord.com/api/v10";

/**
 * How long a member's role list is trusted.
 *
 * Short enough that removing someone's staff role takes effect within half a minute, long enough
 * that the placeholder refresh — which asks about every online player on a timer — does not turn
 * into a Discord call per player per pass.
 */
const ROLE_CACHE_TTL_MS = 30_000;

const roleCache = new TtlCache<string[]>(ROLE_CACHE_TTL_MS);

function botToken(): string | null {
    return mainBotToken();
}

/**
 * A member's Discord roles, read from Discord.
 *
 * <h2>Why this reads live rather than from a table</h2>
 *
 * Roles used to be answered from `minecraftrolestates`, a projection written when the bot happened
 * to see a member update. That made every consumer depend on an event having fired at some point in
 * the past — and when it had not, the row was simply absent and the API answered "this member holds
 * no roles". A staff member with the role plainly visible in Discord was told they had no rank, and
 * nothing in the failure pointed at a missing row.
 *
 * Discord is the authority on who holds a role, so it is asked. The projection remains as a
 * fallback for when Discord itself is unreachable, which is the one case where a slightly stale
 * answer genuinely beats no answer.
 */
export class DiscordRoleService {
    /**
     * Roles for one member, or null when Discord could not answer.
     *
     * Null is distinct from an empty array on purpose: empty means Discord said "this member has no
     * roles", null means "Discord did not tell us", and only the second is worth falling back for.
     */
    static async rolesOf(guildId: string, discordId: string): Promise<string[] | null> {
        const key = `${guildId}:${discordId}`;

        const cached = roleCache.get(key);
        if (cached) return cached;

        const token = botToken();
        if (!token) {
            Logger.warn("No bot token is configured — falling back to the stored role projection", CTX);
            return null;
        }

        let response: Response;
        try {
            response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}`, {
                headers: { Authorization: `Bot ${token}` },
                signal: AbortSignal.timeout(5_000),
            });
        } catch (error) {
            Logger.warn(`Could not reach Discord for ${discordId}'s roles: ${error}`, CTX);
            return null;
        }

        if (response.status === 404) {
            roleCache.set(key, []);
            return [];
        }

        if (!response.ok) {
            Logger.warn(`Discord refused a member lookup for ${discordId}: ${response.status}`, CTX);
            return null;
        }

        const member = (await response.json().catch(() => null)) as { roles?: unknown } | null;
        const roles = Array.isArray(member?.roles) ? member.roles.filter((id): id is string => typeof id === "string") : [];

        roleCache.set(key, roles);
        return roles;
    }

    /**
     * Roles for one member, falling back to a stored projection when Discord is unreachable.
     *
     * The fallback is what keeps staff working through a Discord outage. It cannot be the primary
     * source, because a projection that was never written is indistinguishable from a member who
     * genuinely holds nothing.
     */
    static async rolesOrFallback(guildId: string, discordId: string, fallback: string[]): Promise<string[]> {
        const live = await this.rolesOf(guildId, discordId);
        if (live) return live;

        Logger.warn(`Serving ${discordId}'s roles from the stored projection — Discord was unreachable`, CTX);
        return fallback;
    }

    /** Drops a member from the cache, so a rank change applies without waiting out the TTL. */
    static invalidate(guildId: string, discordId: string): void {
        roleCache.invalidate(`${guildId}:${discordId}`);
    }
}
