import { ApiError, normaliseUuid, type MinecraftPlayerResponse, type StaffRankSummary } from "@sdk";
import {
    MinecraftConfigRepository,
    MinecraftFreezeRepository,
    MinecraftJailRepository,
    MinecraftLinkCodeRepository,
    MinecraftLinkRepository,
    MinecraftModerationRepository,
    MinecraftRoleStateRepository,
} from "@database/repositories";
import { MINECRAFT_LINK_CODE } from "@constants";
import { generateLinkCode } from "@core/minecraft";

/**
 * Account linking and the composite player read.
 *
 * `GET /api/minecraft/player` deliberately returns link, roles, staff rank, freeze, jail and
 * counts in one document. The plugin needs all of it to decide what a joining player may do, and
 * six separate calls during a join would be six chances for a partial answer.
 */
export class LinkService {
    /** Issues a one-time code. Any outstanding code for the same player is discarded first. */
    static async issueCode(input: {
        guildId: string;
        uuid: string;
        username: string;
        serverId: string;
    }): Promise<{ code: string; expiresAt: Date; minutesValid: number }> {
        const uuid = normaliseUuid(input.uuid);

        const existing = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);
        if (existing) throw ApiError.conflict("That Minecraft account is already linked");

        const expiresAt = new Date(Date.now() + MINECRAFT_LINK_CODE.ttlMs);
        const code = await MinecraftLinkCodeRepository.issue(
            input.guildId,
            generateLinkCode(),
            uuid,
            input.username,
            input.serverId,
            expiresAt,
        );

        return {
            code: code.code,
            expiresAt: code.expiresAt,
            minutesValid: Math.round(MINECRAFT_LINK_CODE.ttlMs / 60_000),
        };
    }

    /**
     * Redeems a code. The code row is claimed destructively, so two people racing the same code
     * cannot both link — the loser gets NOT_FOUND rather than a second link.
     */
    static async verify(input: {
        guildId: string;
        code: string;
        discordId: string;
    }): Promise<{ uuid: string; username: string; discordId: string }> {
        const claimed = await MinecraftLinkCodeRepository.claim(input.guildId, input.code.toUpperCase());
        if (!claimed) throw ApiError.notFound("That link code");

        const alreadyLinked = await MinecraftLinkRepository.getByDiscordId(input.guildId, input.discordId);
        if (alreadyLinked) throw ApiError.conflict("That Discord account is already linked");

        const uuidTaken = await MinecraftLinkRepository.getByUuid(input.guildId, claimed.minecraftUuid);
        if (uuidTaken) throw ApiError.conflict("That Minecraft account is already linked");

        await MinecraftLinkRepository.create(
            input.guildId,
            input.discordId,
            claimed.minecraftUuid,
            claimed.minecraftUsername,
            claimed.serverKey,
        );

        return {
            uuid: claimed.minecraftUuid,
            username: claimed.minecraftUsername,
            discordId: input.discordId,
        };
    }

    static async unlink(guildId: string, ref: { uuid?: string; discordId?: string }): Promise<void> {
        const link = ref.uuid
            ? await MinecraftLinkRepository.getByUuid(guildId, normaliseUuid(ref.uuid))
            : ref.discordId
              ? await MinecraftLinkRepository.getByDiscordId(guildId, ref.discordId)
              : null;

        if (!link) throw ApiError.notLinked();

        await MinecraftLinkRepository.delete(guildId, link.discordId);
        await MinecraftRoleStateRepository.remove(guildId, link.discordId);
    }

    /** The composite read. Everything the plugin needs about one player, in one document. */
    static async player(
        guildId: string,
        ref: { uuid?: string; username?: string; discordId?: string },
    ): Promise<MinecraftPlayerResponse> {
        const link = ref.uuid
            ? await MinecraftLinkRepository.getByUuid(guildId, normaliseUuid(ref.uuid))
            : ref.discordId
              ? await MinecraftLinkRepository.getByDiscordId(guildId, ref.discordId)
              : ref.username
                ? await MinecraftLinkRepository.getByUsername(guildId, ref.username)
                : null;

        const uuid = link?.minecraftUuid ?? (ref.uuid ? normaliseUuid(ref.uuid) : null);
        if (!uuid) throw ApiError.validation({ uuid: "one of uuid, username or discordId is required" });

        const username = link?.minecraftUsername ?? ref.username ?? "unknown";

        const [roleState, freeze, jail, warningCount, noteCount, config] = await Promise.all([
            link ? MinecraftRoleStateRepository.getByDiscordId(guildId, link.discordId) : null,
            MinecraftFreezeRepository.findActive(guildId, uuid),
            MinecraftJailRepository.findActive(guildId, uuid),
            MinecraftModerationRepository.countWarnings(guildId, uuid),
            MinecraftModerationRepository.countNotes(guildId, uuid),
            MinecraftConfigRepository.get(guildId),
        ]);

        const roleIds = roleState?.roleIds ?? [];

        return {
            uuid,
            username,
            linked: Boolean(link),
            discordId: link?.discordId ?? null,
            discordUsername: null,
            roleIds,
            groups: roleState?.groups ?? [],
            staffRank: resolveStaffRank(roleIds, config?.staffRanks ?? []),
            frozen: Boolean(freeze),
            jailed: Boolean(jail),
            warningCount,
            noteCount,
            playTimeMs: 0,
            firstSeenAt: link?.linkedAt?.toISOString() ?? null,
            lastSeenAt: link?.lastSeenAt?.toISOString() ?? null,
        };
    }
}

/**
 * Picks the highest-priority configured rank among the roles a member holds.
 *
 * Precedence is the configured order rather than Discord's own role hierarchy, so an operator can
 * rank Helper above Moderator if their server works that way without rearranging Discord.
 */
export function resolveStaffRank(
    roleIds: string[],
    ranks: Array<{ roleId: string; name: string; group: string; priority: number }>,
): StaffRankSummary | null {
    const held = new Set(roleIds);

    const matches = ranks
        .filter(rank => held.has(rank.roleId))
        .sort((left, right) => left.priority - right.priority);

    const best = matches[0];
    return best ? { roleId: best.roleId, name: best.name, group: best.group, priority: best.priority } : null;
}
