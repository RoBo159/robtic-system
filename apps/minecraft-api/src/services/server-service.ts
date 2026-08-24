import { normaliseUuid, type PlayerJoinResponse, type ServerConfigBundleResponse, type ServerInfoResponse, type ServerReportRequest } from "@sdk";
import {
    MinecraftConfigRepository,
    MinecraftFreezeRepository,
    MinecraftJailRepository,
    MinecraftLinkRepository,
    MinecraftMailRepository,
    MinecraftModerationRepository,
    MinecraftPlayerStatsRepository,
    MinecraftRoleStateRepository,
    MinecraftServerRepository,
    StaffBackupRepository,
} from "@database/repositories";
import { getItemPrices } from "@core/minecraft";
import { API_CACHE_TTL_MS } from "@sdk";
import { TtlCache } from "../lib/ttl-cache";
import { SurvivalService } from "./survival-service";

/** The startup bundle changes rarely and is fetched by every server on every reconnect. */
const bundleCache = new TtlCache<ServerConfigBundleResponse>(API_CACHE_TTL_MS.roles);

/**
 * Server lifecycle, presence, and the configuration bundle the plugin downloads on startup.
 */
export class ServerService {
    static async report(input: ServerReportRequest & { guildId: string }): Promise<void> {
        await MinecraftServerRepository.report({
            guildId: input.guildId,
            serverKey: input.serverId,
            displayName: input.serverName,
            status: input.status,
            onlinePlayers: input.onlinePlayers,
            maxPlayers: input.maxPlayers,
            version: input.minecraftVersion,
            startedAt: input.status === "ONLINE" ? undefined : undefined,
            serverType: input.serverType,
            software: input.software,
            javaVersion: input.javaVersion,
            tps: input.tps,
            memoryUsedMb: input.memoryUsedMb,
            memoryMaxMb: input.memoryMaxMb,
            cpuPercent: input.cpuPercent,
            uptimeMs: input.uptimeMs,
            world: input.world,
            pluginVersion: input.pluginVersion,
        });
    }

    /** A start report additionally stamps `startedAt`, which the uptime field is measured from. */
    static async reportStart(input: ServerReportRequest & { guildId: string }): Promise<void> {
        await MinecraftServerRepository.report({
            guildId: input.guildId,
            serverKey: input.serverId,
            displayName: input.serverName,
            status: "ONLINE",
            onlinePlayers: input.onlinePlayers,
            maxPlayers: input.maxPlayers,
            version: input.minecraftVersion,
            startedAt: new Date(),
            serverType: input.serverType,
            software: input.software,
            javaVersion: input.javaVersion,
            pluginVersion: input.pluginVersion,
        });
    }

    /**
     * Everything the join handler needs, in one call.
     *
     * A join is time-critical — the player is already in the world — so this deliberately resolves
     * link, roles, punishments, history and any unrestored staff backup together rather than
     * making the plugin issue five sequential requests while the player waits.
     */
    static async playerJoin(input: {
        guildId: string;
        serverId: string;
        uuid: string;
        username: string;
    }): Promise<PlayerJoinResponse> {
        const uuid = normaliseUuid(input.uuid);

        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);
        if (link) {
            await MinecraftLinkRepository.touch(input.guildId, uuid, input.username);
        }

        const [roleState, freeze, jail, warningCount, jailCount, reportCount, backup, unreadMail, stats] =
            await Promise.all([
                link ? MinecraftRoleStateRepository.getByDiscordId(input.guildId, link.discordId) : null,
                MinecraftFreezeRepository.findActive(input.guildId, uuid),
                MinecraftJailRepository.findActive(input.guildId, uuid),
                MinecraftModerationRepository.countWarnings(input.guildId, uuid),
                MinecraftJailRepository.countHistory(input.guildId, uuid),
                MinecraftModerationRepository.countReportsAgainst(input.guildId, uuid),
                StaffBackupRepository.get(input.guildId, uuid, input.serverId),
                MinecraftMailRepository.countUnread(input.guildId, uuid),
                MinecraftPlayerStatsRepository.get(uuid),
            ]);

        return {
            linked: Boolean(link),
            discordId: link?.discordId ?? null,
            groups: roleState?.groups ?? [],
            frozen: Boolean(freeze),
            jailed: Boolean(jail),
            // Carried on the join response rather than fetched separately: the plugin teleports a
            // still-jailed player back to the jail on the same tick it applies this, and it should
            // be able to tell them *why* without a second round trip they would arrive before.
            jailReason: jail?.reason ?? null,
            jailRemainingMs: jail?.releaseAt ? Math.max(0, jail.releaseAt.getTime() - Date.now()) : null,
            hasHistory: warningCount > 0 || jailCount > 0 || reportCount > 0,
            warningCount,
            jailCount,
            reportCount,
            pendingStaffRestore: Boolean(backup),
            unreadMail,
            // Carried on the join response for the same reason the mail count is: the plugin's
            // placeholders may not make a request, so whatever they will be asked for has to be in
            // memory by the time the player finishes loading in.
            afk: SurvivalService.afkStatisticsOf(stats),
        };
    }

    static async playerLeave(input: { guildId: string; uuid: string }): Promise<void> {
        const uuid = normaliseUuid(input.uuid);
        const freeze = await MinecraftFreezeRepository.findActive(input.guildId, uuid);
        if (freeze) await MinecraftFreezeRepository.markDisconnected(input.guildId, uuid);
    }

    static async info(guildId: string, serverId?: string): Promise<ServerInfoResponse[]> {
        const servers = serverId
            ? [await MinecraftServerRepository.get(guildId, serverId)].filter(Boolean)
            : await MinecraftServerRepository.list(guildId);

        const config = await MinecraftConfigRepository.get(guildId);

        return servers.filter((server): server is NonNullable<typeof server> => Boolean(server)).map(server => ({
            serverId: server.serverKey,
            serverName: server.displayName,
            serverType: server.serverType ?? null,
            status: server.status,
            address: server.address ?? config?.publicAddress ?? null,
            port: server.port ?? null,
            onlinePlayers: server.onlinePlayers,
            maxPlayers: server.maxPlayers,
            minecraftVersion: server.version ?? null,
            supportedVersions: server.supportedVersions ?? [],
            software: server.software ?? null,
            javaVersion: server.javaVersion ?? null,
            tps: server.tps ?? null,
            memoryUsedMb: server.memoryUsedMb ?? null,
            memoryMaxMb: server.memoryMaxMb ?? null,
            cpuPercent: server.cpuPercent ?? null,
            uptimeMs: server.uptimeMs ?? null,
            world: server.world ?? null,
            lastHeartbeatAt: server.lastHeartbeatAt?.toISOString() ?? null,
            lastRestartAt: server.startedAt?.toISOString() ?? null,
        }));
    }

    /**
     * The startup bundle: prices, staff ranks, lobbies and logging targets in one document.
     *
     * `revision` lets the plugin skip re-applying an unchanged bundle. It is derived from the
     * config's `updatedAt` rather than hashed, which is enough to detect an edit and costs nothing.
     */
    static async configBundle(guildId: string, serverId: string): Promise<ServerConfigBundleResponse> {
        return bundleCache.resolve(`${guildId}:${serverId}`, async () => {
            const [config, prices] = await Promise.all([
                MinecraftConfigRepository.get(guildId),
                getItemPrices(guildId),
            ]);

            const logging: Record<string, string> = {};
            for (const target of config?.logTargets ?? []) {
                if (!target.enabled) continue;
                const destination = target.webhookUrl ?? target.channelId;
                if (destination) logging[target.action] = destination;
            }

            return {
                guildId,
                serverId,
                revision: config?.updatedAt?.toISOString() ?? "0",
                prices: prices.map(price => ({
                    itemKey: price.itemKey,
                    label: price.label,
                    price: price.price,
                    enabled: price.enabled,
                })),
                roleMappings: (config?.staffRanks ?? [])
                    .slice()
                    .sort((left, right) => left.priority - right.priority)
                    .map(rank => ({
                        roleId: rank.roleId,
                        group: rank.group,
                        name: rank.name,
                        priority: rank.priority,
                    })),
                lobbies: (config?.lobbies ?? []).map(lobby => ({
                    id: lobby.id,
                    name: lobby.name,
                    world: lobby.world,
                    x: lobby.x,
                    y: lobby.y,
                    z: lobby.z,
                    yaw: lobby.yaw,
                    pitch: lobby.pitch,
                    permission: lobby.permission,
                })),
                logging,
                baseStaffGroup: config?.baseStaffGroup ?? "staff",
                jailRoleId: config?.jailRoleId ?? null,
            };
        });
    }

    static invalidateBundle(guildId: string, serverId: string): void {
        bundleCache.invalidate(`${guildId}:${serverId}`);
    }
}
