import {
    ApiError,
    normaliseUuid,
    type FreezeStateResponse,
    type JailStateResponse,
    type ReportDto,
    type ReportLocationDto,
} from "@sdk";
import {
    MinecraftFreezeRepository,
    MinecraftJailRepository,
    MinecraftLinkRepository,
    MinecraftModerationRepository,
} from "@database/repositories";
import type { IMinecraftReport, IMinecraftReportLocation } from "@database/models/MinecraftReport";

/**
 * Freeze, jail, warnings, notes and reports.
 *
 * All of it is persisted rather than held in plugin memory, which is what makes the state survive
 * a logout, a restart and a server switch: the plugin re-reads it on join and re-applies whatever
 * it finds, so a punished player cannot escape by reconnecting.
 */
export class ModerationService {
    static async freeze(input: {
        guildId: string;
        targetUuid: string;
        targetUsername: string;
        serverId: string;
        moderatorUuid: string;
        moderatorUsername: string;
        reason?: string;
    }): Promise<FreezeStateResponse> {
        const uuid = normaliseUuid(input.targetUuid);

        const record = await MinecraftFreezeRepository.freeze({
            guildId: input.guildId,
            minecraftUuid: uuid,
            minecraftUsername: input.targetUsername,
            serverId: input.serverId,
            frozenByUuid: normaliseUuid(input.moderatorUuid),
            frozenByUsername: input.moderatorUsername,
            reason: input.reason,
        });

        return {
            targetUuid: uuid,
            frozen: true,
            reason: record.reason ?? null,
            moderatorUuid: record.frozenByUuid,
            since: record.frozenAt.toISOString(),
        };
    }

    static async unfreeze(input: {
        guildId: string;
        targetUuid: string;
        moderatorUuid: string;
    }): Promise<FreezeStateResponse> {
        const uuid = normaliseUuid(input.targetUuid);
        const record = await MinecraftFreezeRepository.unfreeze(input.guildId, uuid, normaliseUuid(input.moderatorUuid));

        if (!record) throw ApiError.conflict("That player is not frozen");

        return { targetUuid: uuid, frozen: false, reason: null, moderatorUuid: null, since: null };
    }

    static async freezeState(guildId: string, uuid: string): Promise<FreezeStateResponse> {
        const normalised = normaliseUuid(uuid);
        const record = await MinecraftFreezeRepository.findActive(guildId, normalised);

        return {
            targetUuid: normalised,
            frozen: Boolean(record),
            reason: record?.reason ?? null,
            moderatorUuid: record?.frozenByUuid ?? null,
            since: record?.frozenAt.toISOString() ?? null,
        };
    }

    /** Records that a frozen player disconnected, which is what the staff alert is built from. */
    static async noteFreezeDisconnect(guildId: string, uuid: string): Promise<void> {
        await MinecraftFreezeRepository.markDisconnected(guildId, normaliseUuid(uuid));
    }

    /**
     * Opens a jail sentence. An existing unreleased sentence is a conflict rather than a second
     * overlapping one — the moderator is shown what is already in force and can extend it instead.
     */
    static async jail(input: {
        guildId: string;
        targetUuid: string;
        targetUsername: string;
        serverId: string;
        moderatorUuid: string;
        moderatorUsername: string;
        durationMs: number | null;
        reason: string;
    }): Promise<JailStateResponse> {
        const uuid = normaliseUuid(input.targetUuid);

        const existing = await MinecraftJailRepository.findActive(input.guildId, uuid);
        if (existing) throw ApiError.conflict("That player is already jailed");

        const record = await MinecraftJailRepository.open({
            guildId: input.guildId,
            minecraftUuid: uuid,
            minecraftUsername: input.targetUsername,
            serverId: input.serverId,
            reason: input.reason,
            moderatorUuid: normaliseUuid(input.moderatorUuid),
            moderatorUsername: input.moderatorUsername,
            durationMs: input.durationMs,
        });

        return this.toJailState(uuid, record);
    }

    static async unjail(input: {
        guildId: string;
        targetUuid: string;
        moderatorUuid: string;
        moderatorUsername: string;
        reason?: string;
    }): Promise<JailStateResponse> {
        const uuid = normaliseUuid(input.targetUuid);

        const record = await MinecraftJailRepository.release(
            input.guildId,
            uuid,
            { uuid: normaliseUuid(input.moderatorUuid), username: input.moderatorUsername },
            input.reason,
        );

        if (!record) throw ApiError.conflict("That player is not jailed");

        return { targetUuid: uuid, jailed: false, reason: null, moderatorUuid: null, jailedAt: null, releaseAt: null, remainingMs: null };
    }

    static async jailState(guildId: string, uuid: string): Promise<JailStateResponse> {
        const normalised = normaliseUuid(uuid);
        const record = await MinecraftJailRepository.findActive(guildId, normalised);
        return this.toJailState(normalised, record);
    }

    private static toJailState(
        uuid: string,
        record: {
            reason: string;
            moderatorUuid: string;
            jailedAt: Date;
            releaseAt: Date | null;
        } | null,
    ): JailStateResponse {
        if (!record) {
            return { targetUuid: uuid, jailed: false, reason: null, moderatorUuid: null, jailedAt: null, releaseAt: null, remainingMs: null };
        }

        return {
            targetUuid: uuid,
            jailed: true,
            reason: record.reason,
            moderatorUuid: record.moderatorUuid,
            jailedAt: record.jailedAt.toISOString(),
            releaseAt: record.releaseAt?.toISOString() ?? null,
            remainingMs: record.releaseAt ? Math.max(0, record.releaseAt.getTime() - Date.now()) : null,
        };
    }

    /**
     * Sentences whose time has run out. The plugin polls this rather than each server keeping its
     * own timer, so a player jailed on one server is released even if that server is down.
     */
    static async sweepExpiredJails(limit = 50): Promise<
        Array<{ guildId: string; uuid: string; username: string; reason: string }>
    > {
        const expired = await MinecraftJailRepository.findExpired(new Date(), limit);
        const released: Array<{ guildId: string; uuid: string; username: string; reason: string }> = [];

        for (const jail of expired) {
            const record = await MinecraftJailRepository.release(
                jail.guildId,
                jail.minecraftUuid,
                { uuid: jail.minecraftUuid, username: "system" },
                "Sentence expired",
            );
            if (record) {
                released.push({
                    guildId: jail.guildId,
                    uuid: jail.minecraftUuid,
                    username: jail.minecraftUsername,
                    reason: jail.reason,
                });
            }
        }

        return released;
    }

    static async jailHistory(guildId: string, uuid: string, limit: number, offset: number) {
        const normalised = normaliseUuid(uuid);
        const [rows, total] = await Promise.all([
            MinecraftJailRepository.history(guildId, normalised, limit, offset),
            MinecraftJailRepository.countHistory(guildId, normalised),
        ]);

        return {
            items: rows.map(row => ({
                reason: row.reason,
                moderatorUsername: row.moderatorUsername,
                durationMs: row.durationMs,
                jailedAt: row.jailedAt.toISOString(),
                releasedAt: row.releasedAt?.toISOString() ?? null,
                releasedBy: row.releasedByUsername ?? null,
                serverId: row.serverId,
            })),
            total,
            limit,
            offset,
        };
    }

    static async addWarning(input: {
        guildId: string;
        targetUuid: string;
        targetUsername: string;
        serverId: string;
        authorUuid: string;
        authorUsername: string;
        text: string;
    }) {
        const record = await MinecraftModerationRepository.addWarning({
            guildId: input.guildId,
            minecraftUuid: normaliseUuid(input.targetUuid),
            minecraftUsername: input.targetUsername,
            serverId: input.serverId,
            authorUuid: normaliseUuid(input.authorUuid),
            authorUsername: input.authorUsername,
            text: input.text,
        });

        return {
            id: String(record._id),
            reason: record.reason,
            issuedByUuid: record.issuedByUuid,
            issuedByUsername: record.issuedByUsername,
            createdAt: record.createdAt.toISOString(),
            serverId: record.serverId,
        };
    }

    static async addNote(input: {
        guildId: string;
        targetUuid: string;
        targetUsername: string;
        serverId: string;
        authorUuid: string;
        authorUsername: string;
        text: string;
    }) {
        const record = await MinecraftModerationRepository.addNote({
            guildId: input.guildId,
            minecraftUuid: normaliseUuid(input.targetUuid),
            minecraftUsername: input.targetUsername,
            serverId: input.serverId,
            authorUuid: normaliseUuid(input.authorUuid),
            authorUsername: input.authorUsername,
            text: input.text,
        });

        return {
            id: String(record._id),
            text: record.text,
            authorUuid: record.authorUuid,
            authorUsername: record.authorUsername,
            createdAt: record.createdAt.toISOString(),
            serverId: record.serverId,
        };
    }

    /**
     * Files a report.
     *
     * Both Discord ids are resolved here rather than sent by the plugin: the game server knows
     * Minecraft UUIDs and nothing else, and having it look up a Discord account would mean a second
     * round trip per report for information the API already holds. Neither link is required — an
     * unlinked player can file a report and can be reported.
     */
    static async addReport(input: {
        guildId: string;
        serverId: string;
        reporterUuid: string;
        reporterUsername: string;
        reporterLocation?: ReportPosition;
        targetUuid: string;
        targetUsername: string;
        targetLocation?: ReportPosition;
        targetOnline?: boolean;
        reason: string;
    }) {
        const reporterUuid = normaliseUuid(input.reporterUuid);
        const targetUuid = normaliseUuid(input.targetUuid);

        const [reporterLink, targetLink] = await Promise.all([
            MinecraftLinkRepository.getByUuid(input.guildId, reporterUuid),
            MinecraftLinkRepository.getByUuid(input.guildId, targetUuid),
        ]);

        const recordedAt = new Date();

        const record = await MinecraftModerationRepository.addReport({
            guildId: input.guildId,
            serverId: input.serverId,
            reporterUuid,
            reporterUsername: input.reporterUsername,
            reporterDiscordId: reporterLink?.discordId,
            reporterLocation: input.reporterLocation
                ? { ...input.reporterLocation, serverId: input.serverId, recordedAt }
                : undefined,
            targetUuid,
            targetUsername: input.targetUsername,
            targetDiscordId: targetLink?.discordId,
            targetLocation: input.targetLocation
                ? { ...input.targetLocation, serverId: input.serverId, recordedAt }
                : undefined,
            targetOnline: input.targetOnline,
            reason: input.reason,
        });

        return this.toReportDto(record);
    }

    static toReportDto(record: IMinecraftReport): ReportDto {
        return {
            id: String(record._id),
            // A report filed before codes existed has none. Falling back to the id keeps it usable
            // everywhere a code is — the GUI can still open it and `/report accept` still resolves
            // it, because the code lookup falls through to an id lookup. It reads badly and that is
            // the correct trade for a handful of historic rows.
            code: record.code || String(record._id),
            reporterUuid: record.reporterUuid,
            reporterUsername: record.reporterUsername,
            reporterDiscordId: record.reporterDiscordId ?? null,
            reporterLocation: toLocationDto(record.reporterLocation),
            targetUuid: record.targetUuid,
            targetUsername: record.targetUsername,
            targetDiscordId: record.targetDiscordId ?? null,
            targetLocation: toLocationDto(record.targetLocation),
            targetOnline: record.targetOnline ?? false,
            reason: record.reason,
            status: record.status,
            assignedToUuid: record.assignedToUuid ?? null,
            assignedToUsername: record.assignedToUsername ?? null,
            resolvedByUuid: record.resolvedByUuid ?? null,
            resolvedByUsername: record.resolvedByUsername ?? null,
            jailApplied: record.jailApplied ?? false,
            createdAt: record.createdAt.toISOString(),
            serverId: record.serverId,
        };
    }
}

/** The part of a location the game server supplies; the rest is filled in when the report is filed. */
type ReportPosition = { world: string; x: number; y: number; z: number };

function toLocationDto(location: IMinecraftReportLocation | undefined): ReportLocationDto | null {
    if (!location) return null;

    return {
        world: location.world,
        x: location.x,
        y: location.y,
        z: location.z,
        serverId: location.serverId ?? null,
        recordedAt: location.recordedAt?.toISOString() ?? null,
    };
}
