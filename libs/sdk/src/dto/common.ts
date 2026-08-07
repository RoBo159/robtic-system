import type { ApiErrorCode } from "../errors/error-codes";

/**
 * Every Robtic API response uses this envelope. A client can therefore branch on `ok` before it
 * knows anything else about the route, which is what lets the SDK client have one response path.
 */
export type ApiEnvelope<T> =
    | { ok: true; data: T }
    | { ok: false; error: { code: ApiErrorCode; message: string; details?: Record<string, string> } };

/** Identity every request from a game server carries, taken from its config.yml. */
export interface ServerIdentity {
    /** Stable key, unique per Minecraft server inside a guild. */
    serverId: string;
    serverName: string;
    /** Free-form category — survival, skyblock, prison, minigames. */
    serverType?: string;
    pluginVersion?: string;
}

/** A page of rows plus the cursor needed to ask for the next one. */
export interface Paged<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
}

/** Shared shape for a request that names a player by either identifier. */
export interface PlayerRef {
    /** Dashed Mojang UUID, lowercase. */
    uuid?: string;
    username?: string;
    discordId?: string;
}

/** Acknowledgement for a write that has no meaningful body. */
export interface AckResponse {
    acknowledged: true;
    /** Echoed back so a replayed queue entry can be matched to its original. */
    requestId?: string;
    /** True when the API recognised this request id and skipped the write. */
    duplicate?: boolean;
}
