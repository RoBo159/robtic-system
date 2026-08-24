import type { ServerIdentity } from "./common";

/**
 * RobticAuth: the game server's half of Discord-first authentication.
 *
 * <h2>The plugin never sees a credential</h2>
 *
 * No hash, no salt and no recovery secret appears in any of these shapes. The game server sends a
 * password once, at the moment the player types it, and is told yes or no. Everything else it holds
 * — whether somebody is linked, whether they have a password at all, which session is live — is
 * state, not secret, and is exactly what the join path needs to decide where to put a player.
 *
 * <h2>Why `hasPassword` is on the wire</h2>
 *
 * A linked player without a password is an ordinary case: every account linked before RobticAuth is
 * one. The plugin has to tell them apart from a player who has a password, because the first needs
 * the recovery flow and the second needs the login prompt — and it must decide that on the join
 * tick, without a second round trip.
 */

/** What the plugin does with a joining player. */
export type AuthOutcome =
    /** No Discord link at all: send them to the Link World and the `/link` flow. */
    | "needs_link"
    /** Linked, has a password, no live session: show the login screen. */
    | "needs_login"
    /** Linked but no password yet — legacy link, or an admin reset. Recovery sets one. */
    | "needs_password"
    /** A stored session was still valid: straight to spawn, no prompt. */
    | "authenticated";

/** `GET /api/auth/state` — everything the join handler needs to place a player. */
export interface AuthStateResponse {
    uuid: string;
    username: string;
    outcome: AuthOutcome;
    linked: boolean;
    discordId: string | null;
    /** False for a linked player who has never set one; they recover rather than log in. */
    hasPassword: boolean;
    /** The live session that was accepted, when `outcome` is `authenticated`. */
    session: AuthSessionDto | null;
    /**
     * Milliseconds until the next login attempt is allowed, or null when the budget is intact.
     *
     * Present on the state read as well as on a refused login so the plugin can say "try again in
     * two minutes" on the login screen itself, rather than only after another failed attempt.
     */
    retryAfterMs: number | null;
}

/** A live login session. Carries no secret beyond its own identifier. */
export interface AuthSessionDto {
    sessionId: string;
    /** ISO-8601. */
    createdAt: string;
    expiresAt: string;
    lastLoginAt: string;
    serverId: string | null;
}

/** `POST /api/auth/login` — the player typed their password. */
export interface AuthLoginRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    password: string;
    /**
     * The player's address, which binds the session that this login opens.
     *
     * Sent by the game server because only it can see the connection; the API stores a hash and
     * never the value. Omit it to open a session with no binding — see `AuthResumeRequest`.
     */
    address?: string;
    requestId: string;
}

/**
 * `POST /api/auth/login` — the answer.
 *
 * A wrong password is `ok: false` with a reason, not an HTTP error. It is an expected outcome of a
 * login form and the plugin has to render it to the player either way; making it an exception would
 * mean every caller unwrapping one to find out something ordinary happened.
 */
export interface AuthLoginResponse {
    ok: boolean;
    /** Present when `ok` is false. */
    reason: AuthFailureReason | null;
    /** Present when `ok` is true. */
    session: AuthSessionDto | null;
    /** Attempts left before the budget is exhausted, for the "3 attempts remaining" line. */
    attemptsRemaining: number | null;
    /** Set when the budget is exhausted; the plugin refuses locally until it elapses. */
    retryAfterMs: number | null;
}

export type AuthFailureReason =
    | "wrong_password"
    /** Linked but no password set — the caller should offer recovery, not retry. */
    | "no_password"
    | "not_linked"
    | "rate_limited";

/**
 * `POST /api/auth/session/resume` — a returning player presenting a stored session.
 *
 * <h2>The address is what makes this safe</h2>
 *
 * The session is offered by the game server, not by the client, so on an offline-mode server — the
 * only kind that needs passwords — the UUID proves nothing and anybody connecting under the same
 * name would be handed the account. The address is the one thing an impostor does not share, so a
 * session opened with one is only ever accepted back from the same one.
 *
 * Omitting it matches only sessions that were themselves opened without one, so an operator turning
 * the binding on does not silently keep honouring the unbound sessions issued while it was off.
 */
export interface AuthResumeRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    sessionId: string;
    address?: string;
}

/** `POST /api/auth/session/resume` — accepted, or a reason to ask for the password instead. */
export interface AuthResumeResponse {
    ok: boolean;
    session: AuthSessionDto | null;
}

/** `POST /api/auth/logout` — ends sessions for a player. */
export interface AuthLogoutRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    /** Omit to end every session for the player, which is what a password change does. */
    sessionId?: string;
    requestId: string;
}

/** `POST /api/auth/recovery` — the player pressed *Forgot Password* on the login screen. */
export interface AuthRecoveryRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    requestId: string;
}

/**
 * `POST /api/auth/recovery` — the code to read out, and where to take it.
 *
 * The code is returned to the game server because the game server is where the player is: they
 * pressed a button in a GUI and are looking at it. It is single-use, expires in ten minutes, and is
 * redeemable only by the Discord account the link names — so showing it on screen is safe in a way
 * that emailing a reset link is not.
 */
export interface AuthRecoveryResponse {
    /** Already grouped for display: `D92L-X71M`. */
    code: string;
    expiresAt: string;
    minutesValid: number;
    /** So the plugin can name the account the player must use, rather than "your Discord". */
    discordId: string;
}

/** `POST /api/auth/admin` — the force-link, reset and revoke operations. */
export interface AuthAdminRequest extends ServerIdentity {
    guildId: string;
    action: AuthAdminAction;
    /** The player being acted on. */
    uuid: string;
    username: string;
    /** Required by `force_link` only. */
    discordId?: string;
    /** Who did it, for the audit trail. */
    actorUuid: string;
    actorUsername: string;
    requestId: string;
}

export type AuthAdminAction =
    | "force_link"
    | "force_unlink"
    | "reset_password"
    | "reset_session"
    | "list_sessions";

/** `POST /api/auth/admin` — what the operation did. */
export interface AuthAdminResponse {
    action: AuthAdminAction;
    uuid: string;
    /** Human-readable outcome, so the plugin can echo one line without a switch of its own. */
    summary: string;
    /** Populated by `list_sessions`. */
    sessions: AuthSessionDto[];
}
