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
     * Opens a session. Refuses when the player is not linked or holds no configured staff role,
     * so eligibility is decided by Discord rather than by a Bukkit permission node.
     */
    static async enable(input: {
        guildId: string;
        uuid: string;
        username: string;
        serverId: string;
        snapshot: InventorySnapshot;
        /** The rank the game server resolved from its own roles.yml, when it sent one. */
        claimed?: { roleId: string; name: string; group: string; priority: number };
    }): Promise<StaffEnableResponse> {
        const uuid = normaliseUuid(input.uuid);

        const config = await MinecraftConfigRepository.get(input.guildId);
        if (config && !config.staffSystemEnabled) {
            throw ApiError.forbidden("The staff system is disabled for this guild");
        }

        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);
        if (!link) throw ApiError.notLinked();

        const roleState = await MinecraftRoleStateRepository.getByDiscordId(input.guildId, link.discordId);
        const held = roleState?.roleIds ?? [];

        /**
         * Ranks are defined by the game server, membership is proved by Discord.
         *
         * The server sends the rank it resolved from roles.yml, and the only thing checked here is
         * that the Discord role behind it is genuinely one this member holds. That keeps the ladder
         * in one file — the API used to hold a second copy in `staffRanks`, and an operator who
         * filled in one and not the other got a local pass followed by a refusal here, with nothing
         * to say which config was at fault.
         *
         * What is deliberately *not* dropped is the Discord check. Without it, editing roles.yml
         * would be enough to make anyone staff, and the point of the design is that leaving the
         * Discord role removes the rank everywhere at once.
         *
         * A server that sends no claim falls back to the API-side ladder, so an older plugin keeps
         * working against a newer API.
         */
        const rank = input.claimed
            ? held.includes(input.claimed.roleId)
                ? input.claimed
                : null
            : resolveStaffRank(held, config?.staffRanks ?? []);

        if (!rank) {
            throw ApiError.forbidden(
                input.claimed
                    ? `You do not hold the Discord role for ${input.claimed.name}. ` +
                      `The rank is configured in roles.yml, but the role must be granted in Discord.`
                    : "You do not hold a configured Discord staff role",
            );
        }

        const existing = await StaffSessionRepository.findActive(input.guildId, uuid);
        if (existing) throw ApiError.conflict("A staff session is already open for this account");

        const baseGroup = config?.baseStaffGroup ?? "staff";

        // Written and awaited before the plugin is allowed to clear anything. Everything else in
        // this method is recoverable; losing an inventory is not.
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
            discordId: link.discordId,
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
