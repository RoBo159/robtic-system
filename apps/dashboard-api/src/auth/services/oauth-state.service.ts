import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { sessionConfig } from "../../config";
import { COOKIE_PATH, OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS } from "../constants";
import type { CookieDescriptor } from "../interfaces";

/**
 * The OAuth `state` parameter: minted at login, checked at callback.
 *
 * This is the CSRF defence for the sign-in flow, and it is the whole reason the login route sets a
 * cookie at all. Without it, anyone can hand a victim a crafted `/auth/callback?code=…` URL and log
 * that victim into *the attacker's* Discord account — after which everything the victim does on the
 * dashboard happens under an identity they did not choose.
 *
 * Its own service rather than three lines in the controller because both halves have to agree about
 * the cookie name, the lifetime and the comparison, and a check that is subtly wrong still looks
 * like it is working.
 */
@Injectable()
export class OAuthStateService {
    constructor(@Inject(sessionConfig.KEY) private readonly config: ConfigType<typeof sessionConfig>) {}

    issue(): CookieDescriptor {
        return {
            name: OAUTH_STATE_COOKIE,
            value: randomBytes(16).toString("hex"),
            options: {
                httpOnly: true,
                sameSite: "lax",
                secure: this.config.secureCookies,
                maxAge: OAUTH_STATE_TTL_MS,
                path: COOKIE_PATH,
            },
        };
    }

    /**
     * Throws unless the callback belongs to a handshake this browser began.
     *
     * One message for every failure — missing, mismatched or expired. Distinguishing them would tell
     * an attacker probing the endpoint which half of the check they got past.
     */
    assertMatches(received: string | undefined, expected: string | undefined): void {
        if (!received || !expected || !equal(received, expected)) {
            throw new UnauthorizedException(INVALID_HANDSHAKE);
        }
    }

    /**
     * Narrows the callback's `code`, which the DTO types as optional because a declined consent
     * screen arrives without one.
     *
     * Same message as a state mismatch, on purpose: from outside, "you cancelled" and "that link is
     * stale" are the same instruction — start again.
     */
    requireCode(code: string | undefined): string {
        if (!code) throw new UnauthorizedException(INVALID_HANDSHAKE);
        return code;
    }

    clearTarget(): { name: string; options: { path: string } } {
        return { name: OAUTH_STATE_COOKIE, options: { path: COOKIE_PATH } };
    }
}

const INVALID_HANDSHAKE = "This sign-in link is no longer valid — start again";

/** Length-checked first, because `timingSafeEqual` throws rather than returning false on a mismatch. */
function equal(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    if (left.length !== right.length) return false;

    return timingSafeEqual(left, right);
}
