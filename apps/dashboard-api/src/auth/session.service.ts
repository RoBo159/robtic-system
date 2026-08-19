import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { ENV, type DashboardEnv } from "../config/env";

export interface SessionPayload {
    /** Discord user id. */
    sub: string;
    username: string;
    avatar: string | null;
    /** Discord OAuth access token, kept server-side so the browser never holds it. */
    accessToken: string;
    /** Epoch ms. */
    expiresAt: number;
    /** Rotated on every login so a stolen cookie dies when the user signs in again. */
    jti: string;
}

export const SESSION_COOKIE = "robtic_session";

/**
 * Stateless signed-cookie sessions.
 *
 * No session store, because there is nothing to store: the payload is small, and a database round
 * trip on every request to the dashboard is a cost with no matching benefit at this size. The
 * trade-off is that a session cannot be revoked before it expires except by rotating the secret,
 * which is why `sessionTtlMs` is short by default and `jti` changes on every login.
 *
 * The Discord access token rides inside the cookie value, which is safe only because the value is
 * signed *and* the cookie is httpOnly — it is never readable by page scripts.
 */
@Injectable()
export class SessionService {
    constructor(@Inject(ENV) private readonly env: DashboardEnv) {}

    issue(user: { id: string; username: string; avatar: string | null }, accessToken: string): string {
        const payload: SessionPayload = {
            sub: user.id,
            username: user.username,
            avatar: user.avatar,
            accessToken,
            expiresAt: Date.now() + this.env.sessionTtlMs,
            jti: randomUUID(),
        };

        const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
        return `${body}.${this.sign(body)}`;
    }

    /** Null for anything that is not a currently valid session — tampered, expired or absent. */
    verify(cookie: string | undefined): SessionPayload | null {
        if (!cookie) return null;

        const [body, signature] = cookie.split(".");
        if (!body || !signature) return null;

        const expected = this.sign(body);
        // Both are hex of the same hash, so the lengths always match; the guard is for a truncated
        // signature, where timingSafeEqual would throw rather than return false.
        if (signature.length !== expected.length) return null;
        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

        try {
            const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
            return payload.expiresAt > Date.now() ? payload : null;
        } catch {
            return null;
        }
    }

    cookieOptions(): { httpOnly: true; sameSite: "lax"; secure: boolean; maxAge: number; path: string } {
        return {
            httpOnly: true,
            // `lax` rather than `strict`: the OAuth callback is a top-level navigation back from
            // discord.com, and a strict cookie would not be sent with it.
            sameSite: "lax",
            secure: this.env.secureCookies,
            maxAge: this.env.sessionTtlMs,
            path: "/",
        };
    }

    private sign(body: string): string {
        return createHmac("sha256", this.env.sessionSecret).update(body).digest("hex");
    }
}
