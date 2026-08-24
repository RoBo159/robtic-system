import {
    ApiError,
    normaliseUuid,
    type AuthAdminAction,
    type AuthAdminResponse,
    type AuthLoginResponse,
    type AuthOutcome,
    type AuthRecoveryResponse,
    type AuthResumeResponse,
    type AuthSessionDto,
    type AuthStateResponse,
} from "@sdk";
import {
    MinecraftLinkRepository,
    MinecraftPlayerAccountRepository,
    MinecraftPlayerSessionRepository,
    MinecraftRecoveryCodeRepository,
    MinecraftRoleStateRepository,
    RobsRepository,
} from "@database/repositories";
import type { IMinecraftPlayerSession } from "@database/models/MinecraftPlayerSession";
import { MINECRAFT_AUTH } from "@constants";
import { formatRecoveryCode, generateRecoveryCode, hashPassword, verifyPassword } from "@core/minecraft";
import { Logger } from "@logger";

const CTX = "minecraft-api";

/** Attempts allowed when issuing a recovery code, against the unique index. Same shape as LinkService. */
const ISSUE_ATTEMPTS = 3;

function isDuplicateKey(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}

/**
 * Hashes an address for session binding, or returns undefined when the caller sent none.
 *
 * SHA-256 with no salt, deliberately: the value has to be *reproducible* across servers and across
 * restarts to be comparable at all, which a per-row salt would prevent. That makes it reversible by
 * brute force over the IPv4 space, so this is not a privacy guarantee — it is the difference between
 * a database dump containing a column of addresses and one containing a column of digests, which is
 * worth having and is all that is being claimed.
 */
async function hashAddress(address?: string | null): Promise<string | undefined> {
    if (!address) return undefined;

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address.trim()));
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * RobticAuth — passwords, sessions and recovery.
 *
 * <h2>The API is the only thing that sees a password</h2>
 *
 * A game server sends the plaintext once, over the same authenticated channel it sends everything
 * else, and receives yes or no. It never holds a hash, never compares one, and cannot be made to
 * leak one by a bug in a menu. That is the whole reason verification lives here rather than in the
 * plugin: a credential check on a game server is a credential check inside a process that also runs
 * other people's plugins.
 *
 * <h2>A linked player without a password is a supported state, not an error</h2>
 *
 * Every account linked before RobticAuth has a link and no password. So does anybody whose password
 * an administrator has reset. Both are reported as {@code needs_password} and both reach a new
 * password through recovery — the same path as somebody who has forgotten theirs. There is
 * deliberately no separate first-time flow, because a flow taken once per player is a flow that is
 * never exercised again and quietly rots.
 *
 * <h2>Rate limiting delays, it does not lock</h2>
 *
 * Exhausting the login budget postpones the next attempt; it never disables the account. Locking on
 * failure would hand anybody who knows a username the ability to lock its owner out — the denial of
 * service being defended against would become the defence.
 */
export class AuthService {
    // ─── The join read ────────────────────────────────────────────────────────────────────────

    /**
     * Everything the join handler needs to decide where to put a player, in one call.
     *
     * A join is time-critical and the player is already in the world, so this resolves the link, the
     * account, the session and the rate-limit state together rather than making the plugin ask four
     * times while somebody stands frozen at spawn.
     *
     * Presenting a `sessionId` is optional and is what makes the fast path fast: a returning player
     * whose session is still live is authenticated by this read alone and never sees a prompt.
     */
    static async state(input: {
        guildId: string;
        uuid: string;
        username: string;
        serverId?: string;
        sessionId?: string;
        address?: string;
    }): Promise<AuthStateResponse> {
        const uuid = normaliseUuid(input.uuid);

        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);

        if (!link) {
            return {
                uuid,
                username: input.username,
                outcome: "needs_link",
                linked: false,
                discordId: null,
                hasPassword: false,
                session: null,
                retryAfterMs: null,
            };
        }

        // Upserted on every join of a linked player. This is what gives an account linked before
        // RobticAuth a row the first time it is asked about, so an existing link keeps working with
        // no migration and no re-link.
        const account = await MinecraftPlayerAccountRepository.ensure({
            guildId: input.guildId,
            minecraftUuid: uuid,
            minecraftUsername: input.username,
            discordId: link.discordId,
        });

        const hasPassword = await this.hasPassword(input.guildId, uuid);

        // Resolved by address, not by an id the game server would have to remember between visits.
        // The address is what makes a session mean anything — see `acceptByAddress` — and looking it
        // up this way is what lets a session opened on survival be honoured in the lobby.
        //
        // A caller that does hold an id may still present one, which pins the answer to exactly that
        // session rather than to whichever is newest.
        const ipHash = await hashAddress(input.address);

        const session = input.sessionId
            ? await MinecraftPlayerSessionRepository.accept(input.guildId, input.sessionId, uuid, ipHash)
            : await MinecraftPlayerSessionRepository.acceptByAddress(input.guildId, uuid, ipHash);

        if (session) {
            await MinecraftPlayerAccountRepository.recordLogin(input.guildId, uuid, input.serverId);
        }

        const outcome: AuthOutcome = session
            ? "authenticated"
            : hasPassword
              ? "needs_login"
              : "needs_password";

        return {
            uuid,
            username: input.username,
            outcome,
            linked: true,
            discordId: link.discordId,
            hasPassword,
            session: session ? this.toSessionDto(session) : null,
            retryAfterMs: this.retryAfterMs(account.failedAttempts, account.failedAttemptsSince),
        };
    }

    // ─── Login ────────────────────────────────────────────────────────────────────────────────

    /**
     * Verifies a password and opens a session.
     *
     * <h2>Failure is a result, not an exception</h2>
     *
     * A wrong password is the single most common outcome of a login form. Reporting it as an HTTP
     * error would mean every caller unwrapping an exception to discover something entirely ordinary,
     * and would put a stack trace in the log each time somebody fat-fingered their own password.
     *
     * The one thing that *is* thrown is a missing link, because that means the caller asked about a
     * player who cannot log in at all — a bug on its side rather than a mistake on the player's.
     */
    static async login(input: {
        guildId: string;
        uuid: string;
        username: string;
        password: string;
        serverId?: string;
        address?: string;
    }): Promise<AuthLoginResponse> {
        const uuid = normaliseUuid(input.uuid);

        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);
        if (!link) {
            return this.refuse("not_linked", null, null);
        }

        const account = await MinecraftPlayerAccountRepository.getWithHash(input.guildId, uuid);

        const retryAfterMs = account
            ? this.retryAfterMs(account.failedAttempts, account.failedAttemptsSince)
            : null;

        if (retryAfterMs !== null) {
            return this.refuse("rate_limited", 0, retryAfterMs);
        }

        if (!account?.passwordHash) {
            // Nothing to check against. Reported distinctly so the plugin offers recovery rather
            // than inviting the player to guess a password that does not exist.
            return this.refuse("no_password", null, null);
        }

        const correct = await verifyPassword(account.passwordHash, input.password);

        if (!correct) {
            const failures = await MinecraftPlayerAccountRepository.recordFailure(input.guildId, uuid);
            const { maxAttempts } = MINECRAFT_AUTH.rateLimit.login;

            Logger.warn(`Failed login for ${input.username} (${failures}/${maxAttempts})`, CTX);

            return this.refuse(
                "wrong_password",
                Math.max(0, maxAttempts - failures),
                failures >= maxAttempts ? MINECRAFT_AUTH.rateLimit.login.windowMs : null,
            );
        }

        const session = await this.openSession(
            input.guildId,
            uuid,
            link.discordId,
            input.serverId,
            input.address,
        );
        await MinecraftPlayerAccountRepository.recordLogin(input.guildId, uuid, input.serverId);

        return { ok: true, reason: null, session, attemptsRemaining: null, retryAfterMs: null };
    }

    /** Accepts a stored session, for a plugin that holds one and wants to skip the prompt. */
    static async resume(input: {
        guildId: string;
        uuid: string;
        sessionId: string;
        serverId?: string;
        address?: string;
    }): Promise<AuthResumeResponse> {
        const uuid = normaliseUuid(input.uuid);

        const session = await MinecraftPlayerSessionRepository.accept(
            input.guildId,
            input.sessionId,
            uuid,
            await hashAddress(input.address),
        );

        if (!session) return { ok: false, session: null };

        await MinecraftPlayerAccountRepository.recordLogin(input.guildId, uuid, input.serverId);
        return { ok: true, session: this.toSessionDto(session) };
    }

    /** Ends one session, or every session for the player when no id is given. */
    static async logout(input: {
        guildId: string;
        uuid: string;
        sessionId?: string;
    }): Promise<{ ended: number }> {
        const uuid = normaliseUuid(input.uuid);

        if (input.sessionId) {
            const ended = await MinecraftPlayerSessionRepository.revoke(input.guildId, input.sessionId);
            return { ended: ended ? 1 : 0 };
        }

        return { ended: await MinecraftPlayerSessionRepository.revokeAll(input.guildId, uuid) };
    }

    // ─── Recovery ─────────────────────────────────────────────────────────────────────────────

    /**
     * Issues the code the *Forgot Password* button shows.
     *
     * <h2>Deliberately allowed for a player with no password</h2>
     *
     * This is the path that gives an account linked before RobticAuth its first password, so
     * requiring an existing one would lock out exactly the players who most need it. Pressing the
     * button proves possession of the Minecraft account; redeeming the code on Discord proves
     * possession of the linked Discord account. Two proofs either way, whether the password is being
     * replaced or set for the first time.
     */
    static async issueRecoveryCode(input: {
        guildId: string;
        uuid: string;
        username: string;
        serverId?: string;
    }): Promise<AuthRecoveryResponse> {
        const uuid = normaliseUuid(input.uuid);

        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);
        if (!link) throw ApiError.notLinked();

        const expiresAt = new Date(Date.now() + MINECRAFT_AUTH.recoveryCode.ttlMs);

        for (let attempt = 0; attempt < ISSUE_ATTEMPTS; attempt++) {
            try {
                const issued = await MinecraftRecoveryCodeRepository.issue({
                    guildId: input.guildId,
                    code: generateRecoveryCode(),
                    minecraftUuid: uuid,
                    minecraftUsername: input.username,
                    discordId: link.discordId,
                    serverKey: input.serverId,
                    expiresAt,
                });

                return {
                    code: formatRecoveryCode(issued.code),
                    expiresAt: issued.expiresAt.toISOString(),
                    minutesValid: Math.round(MINECRAFT_AUTH.recoveryCode.ttlMs / 60_000),
                    discordId: link.discordId,
                };
            } catch (error) {
                if (!isDuplicateKey(error) || attempt === ISSUE_ATTEMPTS - 1) throw error;
            }
        }

        throw ApiError.internal("Could not issue a recovery code");
    }

    /**
     * Redeems a recovery code and sets the password. Called from the Discord *Change Password* modal.
     *
     * Every session is ended as part of this. A password change is the action somebody takes when
     * they believe their account is compromised, and leaving the attacker's session alive would make
     * it the one thing the change did not fix.
     *
     * @returns the player whose password changed, so the caller can notify them if they are online.
     */
    static async redeemRecoveryCode(input: {
        guildId: string;
        code: string;
        discordId: string;
        newPassword: string;
    }): Promise<{ uuid: string; username: string; sessionsEnded: number }> {
        const claimed = await MinecraftRecoveryCodeRepository.claim(
            input.guildId,
            input.code,
            input.discordId,
        );

        if (!claimed) throw ApiError.notFound("That recovery code");

        await this.setPassword(input.guildId, claimed.minecraftUuid, input.newPassword, {
            username: claimed.minecraftUsername,
            discordId: input.discordId,
        });

        const sessionsEnded = await MinecraftPlayerSessionRepository.revokeAll(
            input.guildId,
            claimed.minecraftUuid,
        );

        Logger.info(`Password set for ${claimed.minecraftUsername} via recovery code`, CTX);

        return {
            uuid: claimed.minecraftUuid,
            username: claimed.minecraftUsername,
            sessionsEnded,
        };
    }

    /**
     * Hashes and stores a password, creating the account row if this is the first one.
     *
     * The single writer, used by recovery, by the link-with-password modal and by the admin reset.
     * One place hashes, so one place decides the parameters.
     */
    static async setPassword(
        guildId: string,
        uuid: string,
        password: string,
        owner: { username: string; discordId: string },
    ): Promise<void> {
        const minecraftUuid = normaliseUuid(uuid);

        await MinecraftPlayerAccountRepository.ensure({
            guildId,
            minecraftUuid,
            minecraftUsername: owner.username,
            discordId: owner.discordId,
        });

        await MinecraftPlayerAccountRepository.setPassword(
            guildId,
            minecraftUuid,
            await hashPassword(password),
        );
    }

    // ─── Administration ───────────────────────────────────────────────────────────────────────

    /**
     * The admin operations, behind one entry point.
     *
     * One route rather than five because they share a body, an audit shape and a target, and differ
     * only in the verb — the same reason `/api/staff/manage` takes an action.
     */
    static async admin(input: {
        guildId: string;
        action: AuthAdminAction;
        uuid: string;
        username: string;
        discordId?: string;
        actorUsername: string;
    }): Promise<AuthAdminResponse> {
        const uuid = normaliseUuid(input.uuid);

        switch (input.action) {
            case "force_link": {
                if (!input.discordId) {
                    throw ApiError.validation({ discordId: "is required to force a link" });
                }
                return this.forceLink(input.guildId, uuid, input.username, input.discordId, input.actorUsername);
            }

            case "force_unlink":
                return this.forceUnlink(input.guildId, uuid, input.username, input.actorUsername);

            case "reset_password": {
                const cleared = await MinecraftPlayerAccountRepository.clearPassword(input.guildId, uuid);
                const ended = await MinecraftPlayerSessionRepository.revokeAll(input.guildId, uuid);
                await MinecraftRecoveryCodeRepository.discard(input.guildId, uuid);

                Logger.info(`${input.actorUsername} reset the password for ${input.username}`, CTX);

                return this.adminResult(
                    input.action,
                    uuid,
                    cleared
                        ? `Password cleared for ${input.username}; ${ended} session(s) ended. ` +
                          `They can set a new one from the login screen's Forgot Password button.`
                        : `${input.username} has no account to reset.`,
                );
            }

            case "reset_session": {
                const ended = await MinecraftPlayerSessionRepository.revokeAll(input.guildId, uuid);
                Logger.info(`${input.actorUsername} revoked sessions for ${input.username}`, CTX);

                return this.adminResult(
                    input.action,
                    uuid,
                    `Ended ${ended} session(s) for ${input.username}. They will be asked to log in again.`,
                );
            }

            case "list_sessions": {
                const sessions = await MinecraftPlayerSessionRepository.list(input.guildId, uuid);

                return {
                    action: input.action,
                    uuid,
                    summary: sessions.length === 0
                        ? `${input.username} has no live sessions.`
                        : `${input.username} has ${sessions.length} live session(s).`,
                    sessions: sessions.map(session => this.toSessionDto(session)),
                };
            }
        }
    }

    /**
     * Links an account on an administrator's say-so.
     *
     * Refuses when either side is already linked rather than replacing the existing link. A force
     * link is for a player whose linking went wrong, not a way to move an account away from whoever
     * currently holds it — that is an unlink followed by a link, and it should take two decisions.
     */
    private static async forceLink(
        guildId: string,
        uuid: string,
        username: string,
        discordId: string,
        actorUsername: string,
    ): Promise<AuthAdminResponse> {
        const [byUuid, byDiscord] = await Promise.all([
            MinecraftLinkRepository.getByUuid(guildId, uuid),
            MinecraftLinkRepository.getByDiscordId(guildId, discordId),
        ]);

        if (byUuid) {
            throw ApiError.conflict(`${username} is already linked to <@${byUuid.discordId}>.`);
        }
        if (byDiscord) {
            throw ApiError.conflict(`That Discord account is already linked to ${byDiscord.minecraftUsername}.`);
        }

        await MinecraftLinkRepository.create(guildId, discordId, uuid, username, "admin");
        await RobsRepository.attachDiscordId(uuid, discordId);
        await MinecraftPlayerAccountRepository.ensure({
            guildId,
            minecraftUuid: uuid,
            minecraftUsername: username,
            discordId,
        });

        Logger.info(`${actorUsername} force-linked ${username} to Discord ${discordId}`, CTX);

        return this.adminResult(
            "force_link",
            uuid,
            `Linked ${username} to <@${discordId}>. They have no password yet and can set one ` +
            `from the login screen's Forgot Password button.`,
        );
    }

    /**
     * Removes a link and everything that depended on it.
     *
     * The password, the sessions and any outstanding recovery code go with it — all three are
     * meaningless without the link, and leaving a hash behind for an account somebody else may later
     * link would be a credential with no owner.
     *
     * The robs balance is deliberately untouched, exactly as {@code LinkService.unlink} leaves it:
     * robs belong to the Minecraft account, and unlinking Discord must not cost the player anything.
     */
    private static async forceUnlink(
        guildId: string,
        uuid: string,
        username: string,
        actorUsername: string,
    ): Promise<AuthAdminResponse> {
        const link = await MinecraftLinkRepository.getByUuid(guildId, uuid);
        if (!link) throw ApiError.notLinked();

        await MinecraftLinkRepository.delete(guildId, link.discordId);
        await MinecraftRoleStateRepository.remove(guildId, link.discordId);
        await RobsRepository.attachDiscordId(uuid, null);

        const ended = await MinecraftPlayerSessionRepository.revokeAll(guildId, uuid);
        await MinecraftRecoveryCodeRepository.discard(guildId, uuid);
        await MinecraftPlayerAccountRepository.delete(guildId, uuid);

        Logger.info(`${actorUsername} force-unlinked ${username}`, CTX);

        return this.adminResult(
            "force_unlink",
            uuid,
            `Unlinked ${username} and removed their password and ${ended} session(s). ` +
            `Their robs balance is untouched. They will return to the Link World on their next join.`,
        );
    }

    // ─── Plumbing ─────────────────────────────────────────────────────────────────────────────

    /** Whether a password is set. Its own read so nothing else has to pull the hash to find out. */
    private static async hasPassword(guildId: string, uuid: string): Promise<boolean> {
        const account = await MinecraftPlayerAccountRepository.getWithHash(guildId, uuid);
        return Boolean(account?.passwordHash);
    }

    private static async openSession(
        guildId: string,
        uuid: string,
        discordId: string,
        serverId?: string,
        address?: string,
    ): Promise<AuthSessionDto> {
        const session = await MinecraftPlayerSessionRepository.create({
            guildId,
            sessionId: crypto.randomUUID(),
            minecraftUuid: uuid,
            discordId,
            serverKey: serverId,
            ipHash: await hashAddress(address),
            expiresAt: new Date(Date.now() + MINECRAFT_AUTH.session.ttlMs),
        });

        return this.toSessionDto(session);
    }

    /**
     * How long until the next attempt is allowed, or null when the budget is intact.
     *
     * The run is forgiven once its window has elapsed, so five wrong guesses last Tuesday do not
     * count against somebody logging in today. Only a burst inside the window delays anything.
     */
    private static retryAfterMs(failedAttempts: number, since?: Date | null): number | null {
        const { maxAttempts, windowMs } = MINECRAFT_AUTH.rateLimit.login;

        if (failedAttempts < maxAttempts || !since) return null;

        const elapsed = Date.now() - since.getTime();
        return elapsed >= windowMs ? null : windowMs - elapsed;
    }

    private static refuse(
        reason: AuthLoginResponse["reason"],
        attemptsRemaining: number | null,
        retryAfterMs: number | null,
    ): AuthLoginResponse {
        return { ok: false, reason, session: null, attemptsRemaining, retryAfterMs };
    }

    private static adminResult(
        action: AuthAdminAction,
        uuid: string,
        summary: string,
    ): AuthAdminResponse {
        return { action, uuid, summary, sessions: [] };
    }

    private static toSessionDto(session: IMinecraftPlayerSession): AuthSessionDto {
        return {
            sessionId: session.sessionId,
            createdAt: session.createdAt.toISOString(),
            expiresAt: session.expiresAt.toISOString(),
            lastLoginAt: session.lastLoginAt.toISOString(),
            serverId: session.serverKey ?? null,
        };
    }
}
