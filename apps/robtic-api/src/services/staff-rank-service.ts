import { ApiError, normaliseUuid } from "@sdk";
import {
    MinecraftConfigRepository,
    MinecraftLinkRepository,
    MinecraftRoleStateRepository,
} from "@database/repositories";
import { Logger } from "@logger";

const CTX = "robtic-api";
const DISCORD_API = "https://discord.com/api/v10";

/** One rung of the configured ladder. */
interface Rank {
    roleId: string;
    name: string;
    group: string;
    priority: number;
}

function botToken(): string | null {
    return process.env.MainBotToken ?? process.env.TestBot ?? null;
}

/**
 * Moving a linked player up and down the guild's staff ladder from in game.
 *
 * <h2>Direction</h2>
 *
 * Discord roles are the source of truth for staff rank everywhere else in this system, so a
 * promotion is applied *there* and allowed to flow back: the role is added, the old one removed,
 * the projected role state updated, and a `role_sync` queued so the game server's LuckPerms groups
 * follow. Nothing writes a rank directly into the game, because a rank that existed only on one
 * server would disagree with Discord the moment anyone looked.
 *
 * <h2>Ordering</h2>
 *
 * `priority` is ascending-is-senior, matching `resolveStaffRank` — the lowest number a member holds
 * is the rank they are. Promoting therefore moves *down* the priority list, which reads backwards
 * once and is worth the consistency with the resolution the rest of the API already does.
 */
export class StaffRankService {
    /**
     * Promotes or demotes, one rung by default or straight to a named rank.
     *
     * @param target when given, the rank id or name to move to, instead of one step.
     */
    static async change(input: {
        guildId: string;
        uuid: string;
        direction: "promote" | "demote";
        target?: string;
    }): Promise<{ username: string; discordId: string; from: string | null; to: string | null }> {
        const uuid = normaliseUuid(input.uuid);

        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);
        if (!link) throw ApiError.notLinked();

        const config = await MinecraftConfigRepository.get(input.guildId);
        const ladder: Rank[] = [...(config?.staffRanks ?? [])].sort((a, b) => a.priority - b.priority);

        if (ladder.length === 0) {
            throw ApiError.conflict("This guild has no staff ranks configured");
        }

        const state = await MinecraftRoleStateRepository.getByDiscordId(input.guildId, link.discordId);
        const held = new Set(state?.roleIds ?? []);
        const currentIndex = ladder.findIndex(rank => held.has(rank.roleId));
        const current = currentIndex === -1 ? null : ladder[currentIndex]!;

        const next = input.target
            ? this.named(ladder, input.target)
            : this.step(ladder, currentIndex, input.direction);

        if (next === undefined) {
            throw ApiError.conflict(
                input.direction === "promote"
                    ? `${link.minecraftUsername} already holds the highest configured rank`
                    : `${link.minecraftUsername} holds no staff rank to remove`,
            );
        }

        if (next !== null && current && next.roleId === current.roleId) {
            throw ApiError.conflict(`${link.minecraftUsername} already holds ${next.name}`);
        }

        // Ordered add-then-remove. If the second call fails the member is left holding both roles,
        // which resolves to the more senior of the two — a visible over-grant an admin can correct,
        // rather than a member briefly holding nothing and being kicked out of staff channels.
        if (next) await this.applyRole("PUT", input.guildId, link.discordId, next.roleId);
        if (current) await this.applyRole("DELETE", input.guildId, link.discordId, current.roleId);

        const roleIds = [...held].filter(id => id !== current?.roleId);
        if (next) roleIds.push(next.roleId);

        // Projected immediately rather than waiting for Discord's own member-update event, so
        // /admin in game reflects the change without a round trip through the gateway.
        await MinecraftRoleStateRepository.upsert({
            guildId: input.guildId,
            discordId: link.discordId,
            minecraftUuid: uuid,
            roleIds,
            groups: next ? [next.group] : [],
            reason: input.direction,
        }).catch(error => Logger.error(`Failed to project rank change: ${error}`, CTX));

        return {
            username: link.minecraftUsername,
            discordId: link.discordId,
            from: current?.name ?? null,
            to: next?.name ?? null,
        };
    }

    /** The next rung, or `undefined` when there is none in that direction. */
    private static step(
        ladder: Rank[],
        currentIndex: number,
        direction: "promote" | "demote",
    ): Rank | null | undefined {
        if (direction === "promote") {
            // Unranked promotes onto the bottom rung; otherwise one step senior.
            if (currentIndex === -1) return ladder[ladder.length - 1];
            return currentIndex === 0 ? undefined : ladder[currentIndex - 1];
        }

        if (currentIndex === -1) return undefined;
        // Demoting off the bottom rung removes staff status entirely, which `null` represents.
        return currentIndex === ladder.length - 1 ? null : ladder[currentIndex + 1];
    }

    private static named(ladder: Rank[], target: string): Rank | undefined {
        const wanted = target.toLowerCase();
        return ladder.find(rank => rank.name.toLowerCase() === wanted || rank.roleId === target);
    }

    /** Adds or removes one Discord role. Failures are surfaced — a silent no-op would mislead. */
    private static async applyRole(
        method: "PUT" | "DELETE",
        guildId: string,
        discordId: string,
        roleId: string,
    ): Promise<void> {
        const token = botToken();
        if (!token) throw ApiError.internal("No bot token is configured, so Discord roles cannot be changed");

        const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
            method,
            headers: { Authorization: `Bot ${token}`, "X-Audit-Log-Reason": "Robtic in-game rank change" },
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            Logger.error(`Discord refused ${method} role ${roleId} for ${discordId}: ${response.status} ${detail}`, CTX);

            // 403 here is nearly always the bot's own role sitting below the one it is managing,
            // which is a Discord hierarchy setting and not something the caller can fix in game.
            throw response.status === 403
                ? ApiError.forbidden(
                      "Discord refused the role change — move the bot's role above the staff roles it manages",
                  )
                : ApiError.upstream(`Discord rejected the role change (${response.status})`);
        }
    }
}
