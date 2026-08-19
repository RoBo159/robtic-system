/**
 * Every environment variable this service reads, validated once at boot.
 *
 * Deliberately fail-fast: a dashboard that starts without `DISCORD_CLIENT_SECRET` looks healthy
 * until the first person tries to log in, and the error they get names an OAuth response rather
 * than the missing variable.
 */
export interface DashboardEnv {
    port: number;
    mongoUri: string;
    /** Where the browser reaches this API — the OAuth redirect is built from it. */
    publicApiUrl: string;
    /** Where the browser reaches the Next.js app; also the only permitted CORS origin. */
    dashboardUrl: string;
    discord: {
        clientId: string;
        clientSecret: string;
        /** Bot token, used to read which guilds the bot is actually in. */
        botToken: string;
    };
    /** Signs session cookies. Rotating it logs everybody out, which is the intended emergency stop. */
    sessionSecret: string;
    sessionTtlMs: number;
    /** Set false for local http development, where a Secure cookie would never be stored. */
    secureCookies: boolean;
}

const required = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`${key} is not set — apps/dashboard-api cannot start without it`);
    return value;
};

const optional = (key: string, fallback: string): string => process.env[key] || fallback;

export function loadEnv(): DashboardEnv {
    const publicApiUrl = optional("DASHBOARD_API_URL", "http://localhost:3003").replace(/\/+$/, "");
    const dashboardUrl = optional("DASHBOARD_URL", "http://localhost:3000").replace(/\/+$/, "");

    return {
        port: Number(optional("DASHBOARD_API_PORT", "3003")),
        mongoUri: required("MONGODB_URI"),
        publicApiUrl,
        dashboardUrl,
        discord: {
            clientId: required("DISCORD_CLIENT_ID"),
            clientSecret: required("DISCORD_CLIENT_SECRET"),
            botToken: required("DISCORD_BOT_TOKEN"),
        },
        sessionSecret: required("DASHBOARD_SESSION_SECRET"),
        sessionTtlMs: Number(optional("DASHBOARD_SESSION_TTL_MS", String(7 * 24 * 60 * 60 * 1000))),
        secureCookies: optional("DASHBOARD_SECURE_COOKIES", publicApiUrl.startsWith("https://") ? "true" : "false") === "true",
    };
}

export const ENV = "DASHBOARD_ENV";
