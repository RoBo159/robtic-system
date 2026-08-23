import { ApiError, normaliseUuid, type InventorySnapshot, type StaffEnableResponse } from "@sdk";
import {
    MinecraftConfigRepository,
    MinecraftLinkRepository,
    MinecraftRoleStateRepository,
    StaffBackupRepository,
    StaffSessionRepository,
    StaffStatsRepository,
} from "@database/repositories";
import { resolveStaffRank } from "./link-service";
import { DiscordRoleService } from "./discord-role-service";

/**
 * Staff-mode sessions and the inventory backup that makes them reversible.
 *
 * The ordering in {@link enable} is the whole safety property: the backup row is written and
 * awaited before the caller is told it may clear the player's inventory. The plugin honours that
 * contract, so whatever happens next — a disconnect, a reload, a crash — the snapshot is already
 * durable and the next join can restore it.
 */
export class StaffService {
    /**
     * The pre-LuckPerms path: derive a rank from the member's Discord roles.
     *
     * Only reached when a game server sends no rank claim, which today means a plugin older than
     * the LuckPerms change. Kept so upgrading the API does not require upgrading every server on
     * the same day; new servers never take this branch.
     */
    private static async fallbackRank(
        guildId: string,
        discordId: string | undefined,
        configured: Array<{ roleId: string; name: string; group: string; priority: number }>,
    ): Promise<{ roleId?: string; name: string; group: string; priority: number } | null> {
        if (!discordId) return null;

        const roleState = await MinecraftRoleStateRepository.getByDiscordId(guildId, discordId);
        const held = await DiscordRoleService.rolesOrFallback(guildId, discordId, roleState?.roleIds ?? []);

        return resolveStaffRank(held, configured);
    }

    static async enable(input: {
        guildId: string;
        uuid: string;
        username: string;
        serverId: string;
        snapshot: InventorySnapshot;
        /**
         * The rank the game server resolved from its own roles.yml, when it sent one.
         *
         * `roleId` is optional because a rank need not have a Discord role to mirror onto.
         */
        claimed?: { roleId?: string; name: string; group: string; priority: number };
    }): Promise<StaffEnableResponse> {
        const uuid = normaliseUuid(input.uuid);

        const config = await MinecraftConfigRepository.get(input.guildId);
        if (config && !config.staffSystemEnabled) {
            throw ApiError.forbidden("The staff system is disabled for this guild");
        }

        /**
         * A link is recorded when there is one, and is **not** required.
         *
         * Staff membership is a LuckPerms group on the game server now, which says nothing about
         * whether the player owns a Discord account. Refusing a session without a link would mean
         * an operator could hold the rank, pass every check the server makes, and still be unable
         * to open `/admin` — with the refusal blaming Discord for a decision Discord no longer
         * makes.
         *
         * The id is still captured when available, because the audit trail and the staff stats read
         * better with a Discord identity attached.
         */
        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);

        /**
         * The game server decides who is staff; this trusts its claim.
         *
         * <h2>Why the Discord role check is gone</h2>
         *
         * It used to verify that the member genuinely held the Discord role behind the claimed
         * rank. That made sense while Discord granted the rank. It is now backwards: LuckPerms
         * grants the rank and Discord is a *mirror* written downstream of it, so checking the
         * mirror to authorise the thing it reflects fails in two ordinary situations —
         *
         *   - a rank with no `discord-role-id` at all, which roles.yml explicitly allows; and
         *   - the window between a group being granted and the role mirror flushing,
         *
         * — and in both the player holds the group, the server enforces it, and `/admin` refused
         * anyway. That refusal cascaded: every staff command gates on staff mode, so `/hide`,
         * `/a`, `/freeze`, `/jail`, `/warn` and `/notes` all became unusable.
         *
         * Trusting the server is consistent with the rest of this API's trust model: the key
         * already authorises that server to jail players, issue warnings and move balances. A
         * server able to lie about a rank is a server that could already do the thing the rank
         * would let it do.
         *
         * A server that sends no claim falls back to the API-side ladder, so an older plugin keeps
         * working against a newer API.
         */
        const rank = input.claimed ?? await this.fallbackRank(input.guildId, link?.discordId, config?.staffRanks ?? []);

        if (!rank) {
            throw ApiError.forbidden(
                "You do not hold a staff rank. A rank is a LuckPerms group listed in the server's roles.yml.",
            );
        }

        const existing = await StaffSessionRepository.findActive(input.guildId, uuid);
        if (existing) throw ApiError.conflict("A staff session is already open for this account");

        const baseGroup = config?.baseStaffGroup ?? "staff";

        await StaffBackupRepository.put({
            guildId: input.guildId,
            minecraftUuid: uuid,
            minecraftUsername: input.username,
            serverId: input.serverId,
            inventory: input.snapshot.inventory,
            armor: input.snapshot.armor,
            offhand: input.snapshot.offhand,
            enderChest: input.snapshot.enderChest,
            xpLevel: input.snapshot.xpLevel,
            xpProgress: input.snapshot.xpProgress,
            food: input.snapshot.food,
            health: input.snapshot.health,
            heldSlot: input.snapshot.heldSlot,
            location: input.snapshot.location,
            baseGroup,
        });

        const session = await StaffSessionRepository.open({
            guildId: input.guildId,
            minecraftUuid: uuid,
            minecraftUsername: input.username,
            discordId: link?.discordId,
            serverId: input.serverId,
            rankGroup: rank.group,
            rankName: rank.name,
            baseGroup,
        });

        return {
            sessionId: String(session._id),
            rankGroup: rank.group,
            rankName: rank.name,
            baseGroup,
            startedAt: session.startedAt.toISOString(),
        };
    }

    /**
     * Closes a session and hands the snapshot back.
     *
     * The backup is **not** deleted here. The plugin deletes it through {@link confirmRestore} only
     * once the items are actually back in the player's inventory, so a failure between this call
     * and that one leaves the snapshot recoverable rather than lost.
     */
    static async disable(input: {
        guildId: string;
        uuid: string;
        serverId: string;
        reason: "command" | "disconnect" | "shutdown" | "recovery";
    }): Promise<{
        sessionId: string | null;
        snapshot: InventorySnapshot | null;
        baseGroup: string;
        durationMs: number;
    }> {
        const uuid = normaliseUuid(input.uuid);

        const backup = await StaffBackupRepository.get(input.guildId, uuid, input.serverId);
        const session = await StaffSessionRepository.close(input.guildId, uuid, input.reason);

        if (session?.durationMs) {
            await StaffStatsRepository.recordSession(
                input.guildId,
                {
                    uuid,
                    username: session.minecraftUsername,
                    discordId: session.discordId,
                },
                session.durationMs,
            );
        }

        const config = await MinecraftConfigRepository.get(input.guildId);

        return {
            sessionId: session ? String(session._id) : null,
            snapshot: backup
                ? {
                      inventory: backup.inventory,
                      armor: backup.armor,
                      offhand: backup.offhand,
                      enderChest: backup.enderChest,
                      xpLevel: backup.xpLevel,
                      xpProgress: backup.xpProgress,
                      food: backup.food,
                      health: backup.health,
                      heldSlot: backup.heldSlot,
                      location: backup.location,
                  }
                : null,
            baseGroup: backup?.baseGroup ?? config?.baseStaffGroup ?? "staff",
            durationMs: session?.durationMs ?? 0,
        };
    }

    /** Crash recovery: an outstanding backup for a player with no open session. */
    static async pendingBackup(
        guildId: string,
        uuid: string,
        serverId: string,
    ): Promise<{ exists: boolean; snapshot: InventorySnapshot | null; baseGroup: string }> {
        const backup = await StaffBackupRepository.get(guildId, normaliseUuid(uuid), serverId);
        const config = await MinecraftConfigRepository.get(guildId);

        if (!backup) {
            return { exists: false, snapshot: null, baseGroup: config?.baseStaffGroup ?? "staff" };
        }

        return {
            exists: true,
            snapshot: {
                inventory: backup.inventory,
                armor: backup.armor,
                offhand: backup.offhand,
                enderChest: backup.enderChest,
                xpLevel: backup.xpLevel,
                xpProgress: backup.xpProgress,
                food: backup.food,
                health: backup.health,
                heldSlot: backup.heldSlot,
                location: backup.location,
            },
            baseGroup: backup.baseGroup,
        };
    }

    /** Drops the backup. Called by the plugin only after the restore has actually happened. */
    static async confirmRestore(guildId: string, uuid: string, serverId: string): Promise<void> {
        await StaffBackupRepository.remove(guildId, normaliseUuid(uuid), serverId);
    }
}
