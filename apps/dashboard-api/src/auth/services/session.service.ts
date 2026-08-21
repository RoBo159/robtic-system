import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sessionConfig } from "../../config";
import { COOKIE_PATH, SESSION_COOKIE } from "../constants";
import type { CookieDescriptor, DiscordUser, SessionPayload } from "../interfaces";

/**
 * Stateless signed-cookie sessions.
 *
 * No session store, because there is nothing to store: the payload is small, and a database round
 * trip on every request to the dashboard is a cost with no matching benefit at this size. The
 * trade-off is that a session cannot be revoked before it expires except by rotating the secret,
 * which is why `ttlMs` is short by default and `jti` changes on every login.
 *
 * The Discord access token rides inside the cookie value, which is safe only because the value is
 * signed *and* the cookie is httpOnly — it is never readable by page scripts.
 */
@Injectable()
export class SessionService {
    constructor(@Inject(sessionConfig.KEY) private readonly config: ConfigType<typeof sessionConfig>) {}

    /** Mints a session and describes the cookie carrying it; the controller does the setting. */
    issue(user: DiscordUser, accessToken: string): CookieDescriptor {
        const payload: SessionPayload = {
            sub: user.id,
            username: user.username,
            avatar: user.avatar,
            accessToken,
            expiresAt: Date.now() + this.config.ttlMs,
            jti: randomUUID(),
        };

        const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

        return {
            name: SESSION_COOKIE,
            value: `${body}.${this.sign(body)}`,
            options: {
                httpOnly: true,
                sameSite: "lax",
                secure: this.config.secureCookies,
                maxAge: this.config.ttlMs,
                path: COOKIE_PATH,
            },
        };
    }

    /** Null for anything that is not a currently valid session — tampered, expired or absent. */
    verify(cookie: string | undefined): SessionPayload | null {
        if (!cookie) return null;

        const [body, signature] = cookie.split(".");
        if (!body || !signature) return null;

        const expected = this.sign(body);
        if (signature.length !== expected.length) return null;
        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

        try {
            const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
            return payload.expiresAt > Date.now() ? payload : null;
        } catch {
            return null;
        }
    }

    /**
     * Where to clear the session from.
     *
     * `path` has to match the one it was set with, or the browser keeps the original cookie and
     * logging out appears to work while the session stays live.
     */
    clearTarget(): { name: string; options: { path: string } } {
        return { name: SESSION_COOKIE, options: { path: COOKIE_PATH } };
    }

    private sign(body: string): string {
        return createHmac("sha256", this.config.secret).update(body).digest("hex");
    }
}
