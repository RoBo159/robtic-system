/**
 * Cookie names, and the one property both cookies must agree on.
 *
 * In `auth/` rather than `common/`: nothing outside this module sets or reads them. `SessionGuard`
 * and `AuthController` are both here, and a feature module that wanted the session asks for it
 * through `@CurrentSession()` instead of naming a cookie.
 */

/** The signed session. httpOnly, so page scripts never see the Discord token inside it. */
export const SESSION_COOKIE = "robtic_session";

/** The OAuth `state`, held only for the length of a handshake. */
export const OAUTH_STATE_COOKIE = "robtic_oauth_state";

/**
 * Both cookies are scoped to the whole origin, and `clearCookie` only clears a cookie whose path
 * matches the one it was set with — a mismatch here means logout appears to work and does not.
 */
export const COOKIE_PATH = "/";

/** Long enough to finish a Discord consent screen, short enough that a leaked state is worthless. */
export const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
