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
