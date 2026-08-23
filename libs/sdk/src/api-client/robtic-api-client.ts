import { HttpClient, type HttpClientOptions, type RequestOptions } from "./http-client";
import { API_ROUTES } from "../constants/api-routes";
import type { AckResponse, Paged } from "../dto/common";
import type {
    IssueLinkCodeRequest,
    IssueLinkCodeResponse,
    MinecraftPlayerResponse,
    PluginAuthRequest,
    PluginAuthResponse,
    UnlinkRequest,
    VerifyLinkRequest,
    VerifyLinkResponse,
} from "../dto/minecraft";
import type {
    PriceListResponse,
    RobBalanceResponse,
    RobBalancesRequest,
    RobBalancesResponse,
    RobLeaderboardResponse,
    RobMutationRequest,
    RobMutationResponse,
    RobTransactionDto,
    SellRequest,
    SellResponse,
    SetPriceRequest,
} from "../dto/robs";
import type {
    CreateEntryRequest,
    FreezeRequest,
    FreezeStateResponse,
    JailHistoryEntry,
    JailRequest,
    JailStateResponse,
    NoteDto,
    ReportDto,
    StaffBackupResponse,
    StaffDashboardResponse,
    StaffDisableRequest,
    StaffDisableResponse,
    StaffEnableRequest,
    StaffEnableResponse,
    StaffLogRequest,
    StaffPlayerResponse,
    StaffStatsResponse,
    UnjailRequest,
    WarningDto,
} from "../dto/staff";
import type {
    DiscordChatRequest,
    DiscordLogRequest,
    DiscordRolesResponse,
    DiscordStatusRequest,
    RoleSyncRequest,
    RoleSyncResponse,
} from "../dto/discord";
import type {
    PendingEventsResponse,
    PlayerJoinResponse,
    PlayerPresenceRequest,
    ServerConfigBundleResponse,
    ServerInfoResponse,
    ServerReportRequest,
} from "../dto/server";

/**
 * Typed facade over every Robtic API route.
 *
 * This is the only place a Robtic TypeScript application should describe an API call. The Java
 * plugin necessarily has its own transport, but it mirrors these route constants and DTO shapes —
 * the contract lives in this package for both.
 */
export class RobticApiClient {
    private readonly http: HttpClient;

    constructor(options: HttpClientOptions) {
        this.http = new HttpClient(options);
    }

    /** Verifies the configured key and returns what it is allowed to do. */
    authenticate(body: PluginAuthRequest): Promise<PluginAuthResponse> {
        return this.http.post(API_ROUTES.plugin.auth, body, { noRetry: true });
    }

    readonly minecraft = {
        issueLinkCode: (body: IssueLinkCodeRequest): Promise<IssueLinkCodeResponse> =>
            this.http.post(API_ROUTES.minecraft.link, body),

        verifyLink: (body: VerifyLinkRequest): Promise<VerifyLinkResponse> =>
            this.http.post(API_ROUTES.minecraft.verify, body),

        player: (guildId: string, ref: { uuid?: string; username?: string; discordId?: string }): Promise<MinecraftPlayerResponse> =>
            this.http.get(API_ROUTES.minecraft.player, { guildId, ...ref }),

        unlink: (body: UnlinkRequest): Promise<AckResponse> => this.http.post(API_ROUTES.minecraft.unlink, body),
    };

    /**
     * Robs — the Minecraft currency, addressed by Minecraft UUID.
     *
     * There is no coin facade here on purpose. Discord coins are a separate currency the game
     * server cannot reach, and no call in this group touches them.
     */
    readonly robs = {
        /** Never cached anywhere: a stale balance can be spent twice across two servers. */
        balance: (guildId: string, uuid: string): Promise<RobBalanceResponse> =>
            this.http.get(API_ROUTES.robs.balanceOf(uuid), { guildId }),

        /** Many balances in one request — what a placeholder refresh should use. */
        balances: (guildId: string, body: RobBalancesRequest): Promise<RobBalancesResponse> =>
            this.http.post(API_ROUTES.robs.balances, { guildId, ...body }),

        add: (body: RobMutationRequest): Promise<RobMutationResponse> =>
            this.http.post(API_ROUTES.robs.add, body, { requestId: body.requestId }),

        remove: (body: RobMutationRequest): Promise<RobMutationResponse> =>
            this.http.post(API_ROUTES.robs.remove, body, { requestId: body.requestId }),

        sell: (body: SellRequest): Promise<SellResponse> =>
            this.http.post(API_ROUTES.robs.sell, body, { requestId: body.requestId }),

        prices: (guildId: string, revision?: string): Promise<PriceListResponse> =>
            this.http.get(API_ROUTES.robs.prices, { guildId, revision }),

        setPrice: (body: SetPriceRequest): Promise<AckResponse> => this.http.post(API_ROUTES.robs.prices, body),

        leaderboard: (query: { guildId: string; limit?: number; uuid?: string }): Promise<RobLeaderboardResponse> =>
            this.http.get(API_ROUTES.robs.leaderboard, query),

        history: (query: { guildId: string; uuid?: string; limit?: number; offset?: number }): Promise<Paged<RobTransactionDto>> =>
            this.http.get(API_ROUTES.robs.history, query),
    };

    readonly staff = {
        enable: (body: StaffEnableRequest): Promise<StaffEnableResponse> =>
            this.http.post(API_ROUTES.staff.enable, body, { requestId: body.requestId }),

        disable: (body: StaffDisableRequest): Promise<StaffDisableResponse> =>
            this.http.post(API_ROUTES.staff.disable, body, { requestId: body.requestId }),

        backup: (guildId: string, uuid: string): Promise<StaffBackupResponse> =>
            this.http.get(API_ROUTES.staff.backup, { guildId, uuid }),

        freeze: (body: FreezeRequest): Promise<FreezeStateResponse> =>
            this.http.post(API_ROUTES.staff.freeze, body, { requestId: body.requestId }),

        unfreeze: (body: FreezeRequest): Promise<FreezeStateResponse> =>
            this.http.post(API_ROUTES.staff.unfreeze, body, { requestId: body.requestId }),

        jail: (body: JailRequest): Promise<JailStateResponse> =>
            this.http.post(API_ROUTES.staff.jail, body, { requestId: body.requestId }),

        unjail: (body: UnjailRequest): Promise<JailStateResponse> =>
            this.http.post(API_ROUTES.staff.unjail, body, { requestId: body.requestId }),

        log: (body: StaffLogRequest): Promise<AckResponse> =>
            this.http.post(API_ROUTES.staff.log, body, { requestId: body.requestId }),

        history: (query: { guildId: string; uuid: string; limit?: number; offset?: number }): Promise<Paged<JailHistoryEntry>> =>
            this.http.get(API_ROUTES.staff.history, query),

        player: (guildId: string, uuid: string): Promise<StaffPlayerResponse> =>
            this.http.get(API_ROUTES.staff.player, { guildId, uuid }),

        notes: (guildId: string, uuid: string): Promise<Paged<NoteDto>> =>
            this.http.get(API_ROUTES.staff.notes, { guildId, uuid }),

        addNote: (body: CreateEntryRequest): Promise<NoteDto> =>
            this.http.post(API_ROUTES.staff.notes, body, { requestId: body.requestId }),

        warnings: (guildId: string, uuid: string): Promise<Paged<WarningDto>> =>
            this.http.get(API_ROUTES.staff.warnings, { guildId, uuid }),

        addWarning: (body: CreateEntryRequest): Promise<WarningDto> =>
            this.http.post(API_ROUTES.staff.warnings, body, { requestId: body.requestId }),

        removeWarning: (body: { guildId: string; warningId: string; actorUuid: string; requestId: string }): Promise<AckResponse> =>
            this.http.post(API_ROUTES.staff.removeWarning, body, { requestId: body.requestId }),

        reports: (guildId: string, status?: "open" | "resolved" | "dismissed"): Promise<Paged<ReportDto>> =>
            this.http.get(API_ROUTES.staff.reports, { guildId, status }),

        addReport: (body: CreateEntryRequest): Promise<ReportDto> =>
            this.http.post(API_ROUTES.staff.reports, body, { requestId: body.requestId }),

        dashboard: (guildId: string, serverId?: string): Promise<StaffDashboardResponse> =>
            this.http.get(API_ROUTES.staff.dashboard, { guildId, serverId }),

        stats: (guildId: string, uuid: string): Promise<StaffStatsResponse> =>
            this.http.get(API_ROUTES.staff.stats, { guildId, uuid }),

        leaderboard: (guildId: string, limit?: number): Promise<Paged<StaffStatsResponse>> =>
            this.http.get(API_ROUTES.staff.leaderboard, { guildId, limit }),
    };

    readonly discord = {
        roles: (guildId: string, uuid: string): Promise<DiscordRolesResponse> =>
            this.http.get(API_ROUTES.discord.roles, { guildId, uuid }),

        /**
         * Minecraft → Discord. The game server has already resolved which roles it wants applied
         * from the LuckPerms groups it read locally; this only performs the Discord write.
         */
        syncRoles: (body: RoleSyncRequest): Promise<RoleSyncResponse> =>
            this.http.post(API_ROUTES.discord.syncRoles, body, { requestId: body.requestId }),

        chat: (body: DiscordChatRequest): Promise<AckResponse> =>
            this.http.post(API_ROUTES.discord.chat, body, { requestId: body.requestId }),

        log: (body: DiscordLogRequest): Promise<AckResponse> =>
            this.http.post(API_ROUTES.discord.log, body, { requestId: body.requestId }),

        status: (body: DiscordStatusRequest): Promise<AckResponse> =>
            this.http.post(API_ROUTES.discord.status, body, { requestId: body.requestId }),

        /** Drains events Discord queued for this server, replacing the plugin's old Mongo poll. */
        pending: (guildId: string, serverId: string, limit?: number): Promise<PendingEventsResponse> =>
            this.http.get(API_ROUTES.discord.pending, { guildId, serverId, limit }),
    };

    readonly server = {
        start: (body: ServerReportRequest): Promise<AckResponse> => this.http.post(API_ROUTES.server.start, body),
        stop: (body: ServerReportRequest): Promise<AckResponse> =>
            this.http.post(API_ROUTES.server.stop, body, { noRetry: true }),
        status: (body: ServerReportRequest): Promise<AckResponse> => this.http.post(API_ROUTES.server.status, body),
        heartbeat: (body: ServerReportRequest): Promise<AckResponse> => this.http.post(API_ROUTES.server.heartbeat, body),

        playerJoin: (body: PlayerPresenceRequest): Promise<PlayerJoinResponse> =>
            this.http.post(API_ROUTES.server.playerJoin, body, { requestId: body.requestId }),

        playerLeave: (body: PlayerPresenceRequest): Promise<AckResponse> =>
            this.http.post(API_ROUTES.server.playerLeave, body, { requestId: body.requestId }),

        info: (guildId: string, serverId?: string): Promise<ServerInfoResponse[]> =>
            this.http.get(API_ROUTES.server.info, { guildId, serverId }),

        /** The startup bundle: prices, roles, lobbies and logging targets in one round trip. */
        config: (guildId: string, serverId: string, revision?: string): Promise<ServerConfigBundleResponse> =>
            this.http.get(API_ROUTES.server.config, { guildId, serverId, revision }),
    };

    /** Escape hatch for a route not yet wrapped above. */
    raw(options?: RequestOptions): HttpClient {
        void options;
        return this.http;
    }
}
