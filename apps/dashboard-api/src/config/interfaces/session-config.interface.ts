export interface SessionConfig {
    /** Signs session cookies. Rotating it logs everybody out, which is the intended emergency stop. */
    secret: string;
    ttlMs: number;
    /** False for local http development, where a Secure cookie would never be stored. */
    secureCookies: boolean;
}
