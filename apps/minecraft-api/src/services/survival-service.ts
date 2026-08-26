import {
    ApiError,
    normaliseUuid,
    type BackBudgetResponse,
    type ChestLockResponse,
    type InventorySnapshotResponse,
    type LockedChestListResponse,
    type PlayerSettingsResponse,
    type PortableChestResponse,
    type AfkStatisticsDto,
    type ReportAfkSessionResponse,
    type SpawnResponse,
    type WorldLocationDto,
} from "@sdk";
import { roundRobs } from "@constants";
import {
    MinecraftBackUsageRepository,
    MinecraftChestRepository,
    MinecraftInventorySnapshotRepository,
    MinecraftPlayerPrefsRepository,
    MinecraftPlayerStatsRepository,
    MinecraftSpawnRepository,
    RobsRepository,
} from "@database/repositories";
import type { IMinecraftPlayerStats } from "@database/models/MinecraftPlayerStats";
import { PremiumService } from "./premium-service";
import { RobsService } from "./robs-service";

/**
 * Spawn, `/back`, chests and cosmetics.
 *
 * Grouped rather than split into four files because each is a handful of methods over one
 * repository with the same tier check in front of it; four classes would be four copies of that
 * preamble. Homes and friends have their own services because both carry real logic — limit
 * arithmetic and a request state machine respectively.
 */
export class SurvivalService {
    // ─── Spawn ────────────────────────────────────────────────────────────────────────────────

    static async spawn(guildId: string, serverKey: string): Promise<SpawnResponse> {
        const row = await MinecraftSpawnRepository.get(guildId, serverKey);

        return {
            serverId: serverKey,
            location: (row?.location as WorldLocationDto) ?? null,
            updatedAt: row?.updatedAt?.toISOString() ?? null,
        };
    }

    static async setSpawn(input: {
        guildId: string;
        serverKey: string;
        uuid: string;
        username: string;
        location: WorldLocationDto;
    }): Promise<SpawnResponse> {
        const row = await MinecraftSpawnRepository.set({
            guildId: input.guildId,
            serverKey: input.serverKey,
            location: input.location,
            updatedByUuid: normaliseUuid(input.uuid),
            updatedByUsername: input.username,
        });

        return {
            serverId: input.serverKey,
            location: row.location as WorldLocationDto,
            updatedAt: row.updatedAt.toISOString(),
        };
    }

    // ─── Back ─────────────────────────────────────────────────────────────────────────────────

    /** The budget without spending it — what the plugin caches on join. */
    static async backBudget(guildId: string, uuid: string): Promise<BackBudgetResponse> {
        const normalised = normaliseUuid(uuid);
        const [premium, windowMs] = await Promise.all([
            PremiumService.entitlementsOf(guildId, normalised),
            PremiumService.backWindowMs(guildId),
        ]);

        if (premium.backUses <= 0) {
            return {
                uuid: normalised,
                remaining: 0,
                limit: 0,
                resetAt: new Date().toISOString(),
                allowed: false,
            };
        }

        const budget = await MinecraftBackUsageRepository.peek(normalised, premium.backUses, windowMs);

        return {
            uuid: normalised,
            remaining: budget.remaining,
            limit: budget.limit,
            resetAt: budget.resetAt.toISOString(),
            allowed: true,
        };
    }

    /**
     * Spends one `/back`.
     *
     * The plugin decrements its own cached count and only calls this when it believes there is
     * budget — but the check is repeated here anyway, because the cache is per server and two
     * servers must not both hand out the last use.
     */
    static async spendBack(guildId: string, uuid: string): Promise<BackBudgetResponse> {
        const normalised = normaliseUuid(uuid);
        const [premium, windowMs] = await Promise.all([
            PremiumService.entitlementsOf(guildId, normalised),
            PremiumService.backWindowMs(guildId),
        ]);

        if (premium.backUses <= 0) {
            throw ApiError.forbidden("Your rank does not include /back.");
        }

        const budget = await MinecraftBackUsageRepository.trySpend(normalised, premium.backUses, windowMs);

        if (!budget) {
            const peeked = await MinecraftBackUsageRepository.peek(normalised, premium.backUses, windowMs);
            throw ApiError.conflict(
                `You have used all ${premium.backUses} of your /back uses. They reset ` +
                `<t:${Math.floor(peeked.resetAt.getTime() / 1000)}:R>.`,
            );
        }

        return {
            uuid: normalised,
            remaining: budget.remaining,
            limit: budget.limit,
            resetAt: budget.resetAt.toISOString(),
            allowed: true,
        };
    }

    // ─── Locked chests ────────────────────────────────────────────────────────────────────────

    static async locks(guildId: string, uuid: string, serverKey: string): Promise<LockedChestListResponse> {
        const normalised = normaliseUuid(uuid);
        const [chests, premium] = await Promise.all([
            MinecraftChestRepository.listLocks(normalised, serverKey),
            PremiumService.entitlementsOf(guildId, normalised),
        ]);

        return {
            uuid: normalised,
            serverId: serverKey,
            chests: chests.map(chest => ({
                location: chest.location as WorldLocationDto,
                createdAt: chest.createdAt.toISOString(),
            })),
            limit: premium.lockedChestLimit,
        };
    }

    /** Who owns the lock on a block, if anyone. The protection listener's only question. */
    static async lockAt(serverKey: string, location: WorldLocationDto): Promise<{
        locked: boolean;
        ownerUuid: string | null;
        ownerUsername: string | null;
    }> {
        const row = await MinecraftChestRepository.lockAt(serverKey, location);

        return {
            locked: Boolean(row),
            ownerUuid: row?.minecraftUuid ?? null,
            ownerUsername: row?.ownerUsername ?? null,
        };
    }

    static async lock(input: {
        guildId: string;
        uuid: string;
        username: string;
        serverKey: string;
        location: WorldLocationDto;
    }): Promise<ChestLockResponse> {
        const uuid = normaliseUuid(input.uuid);
        const premium = await PremiumService.entitlementsOf(input.guildId, uuid);

        if (premium.lockedChestLimit <= 0) {
            return { applied: false, reason: "not-premium", count: 0, limit: 0 };
        }

        const existing = await MinecraftChestRepository.lockAt(input.serverKey, input.location);

        if (existing) {
            const count = await MinecraftChestRepository.countLocks(uuid, input.serverKey);

            // Already theirs: report success rather than an error, so a double /lock is harmless.
            if (existing.minecraftUuid === uuid) {
                return { applied: true, reason: "ok", count, limit: premium.lockedChestLimit };
            }

            return {
                applied: false,
                reason: "owned-by-other",
                count,
                limit: premium.lockedChestLimit,
                ownerUsername: existing.ownerUsername,
            };
        }

        const used = await MinecraftChestRepository.countLocks(uuid, input.serverKey);
        if (used >= premium.lockedChestLimit) {
            return { applied: false, reason: "limit-reached", count: used, limit: premium.lockedChestLimit };
        }

        await MinecraftChestRepository.lock({
            uuid,
            ownerUsername: input.username,
            serverKey: input.serverKey,
            location: input.location,
        });

        return {
            applied: true,
            reason: "ok",
            count: used + 1,
            limit: premium.lockedChestLimit,
        };
    }

    /** Only the owner may unlock. Staff removal is a moderation action, not this endpoint. */
    static async unlock(input: {
        guildId: string;
        uuid: string;
        serverKey: string;
        location: WorldLocationDto;
    }): Promise<ChestLockResponse> {
        const uuid = normaliseUuid(input.uuid);
        const premium = await PremiumService.entitlementsOf(input.guildId, uuid);
        const existing = await MinecraftChestRepository.lockAt(input.serverKey, input.location);

        if (!existing) {
            const count = await MinecraftChestRepository.countLocks(uuid, input.serverKey);
            return { applied: false, reason: "not-locked", count, limit: premium.lockedChestLimit };
        }

        if (existing.minecraftUuid !== uuid) {
            const count = await MinecraftChestRepository.countLocks(uuid, input.serverKey);
            return {
                applied: false,
                reason: "owned-by-other",
                count,
                limit: premium.lockedChestLimit,
                ownerUsername: existing.ownerUsername,
            };
        }

        await MinecraftChestRepository.unlock(input.serverKey, input.location);
        const count = await MinecraftChestRepository.countLocks(uuid, input.serverKey);

        return { applied: true, reason: "ok", count, limit: premium.lockedChestLimit };
    }

    // ─── Portable chest ───────────────────────────────────────────────────────────────────────

    static async portableChest(uuid: string, serverKey: string): Promise<PortableChestResponse> {
        const normalised = normaliseUuid(uuid);
        const row = await MinecraftChestRepository.portable(normalised, serverKey);

        return {
            uuid: normalised,
            serverId: serverKey,
            location: (row?.location as WorldLocationDto) ?? null,
        };
    }

    static async linkChest(input: {
        guildId: string;
        uuid: string;
        serverKey: string;
        location: WorldLocationDto;
    }): Promise<PortableChestResponse> {
        const uuid = normaliseUuid(input.uuid);
        const premium = await PremiumService.entitlementsOf(input.guildId, uuid);

        if (!premium.portableChest) {
            throw ApiError.forbidden("The portable chest is a Premium II feature.");
        }

        const row = await MinecraftChestRepository.linkPortable({
            uuid,
            serverKey: input.serverKey,
            location: input.location,
        });

        return { uuid, serverId: input.serverKey, location: row.location as WorldLocationDto };
    }

    // ─── Player settings ──────────────────────────────────────────────────────────────────────

    static async settings(guildId: string, uuid: string): Promise<PlayerSettingsResponse> {
        const normalised = normaliseUuid(uuid);
        const [prefs, premium] = await Promise.all([
            MinecraftPlayerPrefsRepository.get(normalised),
            PremiumService.entitlementsOf(guildId, normalised),
        ]);

        return {
            uuid: normalised,
            friendTpAutoAccept: prefs?.friendTpAutoAccept ?? false,
            playersVisible: prefs?.playersVisible ?? true,
            privateProfile: prefs?.privateProfile ?? false,
            joinMessage: prefs?.joinMessage ?? null,
            leaveMessage: prefs?.leaveMessage ?? null,
            particle: prefs?.particle ?? null,
            cosmeticsAllowed: premium.cosmetics,
        };
    }

    /**
     * Applies a partial settings change.
     *
     * The premium gate gets applied per field rather than to the whole request: a free player may
     * always change their visibility and teleport preference, and only the cosmetic fields are
     * refused. Rejecting the entire call because it happened to mention a particle would make the
     * settings menu unusable for everyone without premium.
     */
    static async setSettings(input: {
        guildId: string;
        uuid: string;
        friendTpAutoAccept?: boolean;
        playersVisible?: boolean;
        privateProfile?: boolean;
        joinMessage?: string | null;
        leaveMessage?: string | null;
        particle?: string | null;
    }): Promise<PlayerSettingsResponse> {
        const uuid = normaliseUuid(input.uuid);

        const touchesCosmetics =
            input.joinMessage !== undefined || input.leaveMessage !== undefined || input.particle !== undefined;

        if (touchesCosmetics) {
            const premium = await PremiumService.entitlementsOf(input.guildId, uuid);
            if (!premium.cosmetics) {
                throw ApiError.forbidden("Join messages and particles are a Premium feature.");
            }
        }

        await MinecraftPlayerPrefsRepository.update(uuid, {
            friendTpAutoAccept: input.friendTpAutoAccept,
            playersVisible: input.playersVisible,
            privateProfile: input.privateProfile,
            joinMessage: input.joinMessage,
            leaveMessage: input.leaveMessage,
            particle: input.particle,
        });

        return this.settings(input.guildId, uuid);
    }

    // ─── Survival inventory preview ───────────────────────────────────────────────────────────

    /** Read-only, for the lobby preview. Never restored to a player — see the model. */
    static async inventorySnapshot(uuid: string, serverKey: string): Promise<InventorySnapshotResponse> {
        const normalised = normaliseUuid(uuid);
        const row = await MinecraftInventorySnapshotRepository.get(normalised, serverKey);

        return {
            uuid: normalised,
            world: row?.world ?? null,
            contents: row?.contents ?? "",
            armor: row?.armor ?? "",
            offhand: row?.offhand ?? "",
            capturedAt: row?.capturedAt?.toISOString() ?? null,
        };
    }

    static async putInventorySnapshot(input: {
        uuid: string;
        serverKey: string;
        world: string;
        contents: string;
        armor: string;
        offhand: string;
    }): Promise<{ acknowledged: true }> {
        await MinecraftInventorySnapshotRepository.put({
            uuid: normaliseUuid(input.uuid),
            serverKey: input.serverKey,
            world: input.world,
            contents: input.contents,
            armor: input.armor,
            offhand: input.offhand,
        });

        return { acknowledged: true };
    }

    // ─── Statistics ───────────────────────────────────────────────────────────────────────────

    /** A session's activity, reported as deltas so two servers cannot overwrite each other. */
    static async reportStats(input: {
        uuid: string;
        username: string;
        playtimeMs?: number;
        kills?: number;
        deaths?: number;
    }): Promise<{ acknowledged: true }> {
        await MinecraftPlayerStatsRepository.record({
            uuid: normaliseUuid(input.uuid),
            username: input.username,
            playtimeMs: input.playtimeMs,
            kills: input.kills,
            deaths: input.deaths,
        });

        return { acknowledged: true };
    }

    /**
     * Settles one finished AFK session: the totals and the robs it earned, together.
     *
     * <h2>Why the credit is not computed here</h2>
     *
     * The rate lives in the game server's `afk.yml` and the session's start is a timestamp only that
     * server holds, so it is the only party that can say what the session was worth. Recomputing it
     * from `afkMs` would mean this service also owning the rate — two copies of one number, silently
     * disagreeing the moment an operator changes one of them. It reports the figure and this credits
     * it, which is the same division of labour the ore sale already uses.
     *
     * <h2>Order</h2>
     *
     * The AFK totals are written before the credit. Both are increments and neither can be lost to a
     * concurrent write, so the only thing the order decides is which one a failure between them
     * leaves behind: recording the time without the robs understates a balance, and paying without
     * recording the time would let a replay of the same session pay twice while looking, in the
     * statistics, as though it had never happened at all.
     */
    static async reportAfkSession(input: {
        uuid: string;
        username: string;
        afkMs: number;
        robs: number;
    }): Promise<ReportAfkSessionResponse> {
        const uuid = normaliseUuid(input.uuid);

        // Rounded to the currency's scale, not to a whole number. `Math.round` here was the other
        // half of why AFK appeared to pay nothing: the game server sent 0.83 for a five-minute
        // session and this turned it into 1 — or, for anything under half a rob, into 0 — so even
        // once the plugin stopped flooring, the API was still discarding the fraction.
        const robs = Math.max(0, roundRobs(input.robs));

        const stats = await MinecraftPlayerStatsRepository.recordAfkSession({
            uuid,
            username: input.username,
            afkMs: input.afkMs,
            robs,
        });

        // A session can still be too short to have earned even a hundredth — a few seconds — and
        // that is the ordinary case rather than a failure. The time is recorded either way; there is
        // simply nothing to credit.
        const balance = robs > 0
            ? (await RobsService.credit(uuid, input.username, robs)).robs
            : roundRobs((await RobsRepository.get(uuid))?.robs ?? 0);

        return { uuid, afk: this.afkStatisticsOf(stats), balance };
    }

    /** The AFK projection of a stats row, shared by the profile and the session report. */
    static afkStatisticsOf(stats: IMinecraftPlayerStats | null): AfkStatisticsDto {
        return {
            totalMs: stats?.afkTotalMs ?? 0,
            todayMs: stats?.afkTodayMs ?? 0,
            todayDate: stats?.afkTodayDate ?? "",
            robs: stats?.afkRobs ?? 0,
        };
    }
}
