/**
 * Every Robtic API path in one place. The server registers its router from these constants and the
 * clients build their URLs from them, so a route can never drift between the two sides.
 *
 * Paths with a parameter are exposed as builder functions rather than templates, which keeps the
 * encoding of the parameter in one place too.
 */
export const API_ROUTES = {
    health: "/api/health",
    openapi: "/api/openapi.json",
    docs: "/api/docs",

    plugin: {
        auth: "/api/plugin/auth",
    },

    minecraft: {
        link: "/api/minecraft/link",
        verify: "/api/minecraft/verify",
        player: "/api/minecraft/player",
        unlink: "/api/minecraft/unlink",
    },

    economy: {
        coinsOf: (uuid: string) => `/api/economy/coins/${encodeURIComponent(uuid)}`,
        coinsPattern: /^\/api\/economy\/coins\/([0-9a-fA-F-]{32,36})$/,
        add: "/api/economy/add",
        remove: "/api/economy/remove",
        sell: "/api/economy/sell",
        prices: "/api/economy/prices",
        history: "/api/economy/history",
        leaderboard: "/api/economy/leaderboard",
    },

    staff: {
        enable: "/api/staff/enable",
        disable: "/api/staff/disable",
        freeze: "/api/staff/freeze",
        unfreeze: "/api/staff/unfreeze",
        jail: "/api/staff/jail",
        unjail: "/api/staff/unjail",
        log: "/api/staff/log",
        history: "/api/staff/history",
        player: "/api/staff/player",
        notes: "/api/staff/notes",
        warnings: "/api/staff/warnings",
        removeWarning: "/api/staff/warnings/remove",
        reports: "/api/staff/reports",
        dashboard: "/api/staff/dashboard",
        stats: "/api/staff/stats",
        leaderboard: "/api/staff/leaderboard",
        rank: "/api/staff/rank",
        backup: "/api/staff/backup",
        /** Called once the plugin has actually restored a snapshot, so the backup can be dropped. */
        confirmRestore: "/api/staff/confirm-restore",
    },

    discord: {
        roles: "/api/discord/roles",
        chat: "/api/discord/chat",
        status: "/api/discord/status",
        log: "/api/discord/log",
        pending: "/api/discord/pending",
    },

    server: {
        start: "/api/server/start",
        stop: "/api/server/stop",
        status: "/api/server/status",
        playerJoin: "/api/server/playerJoin",
        playerLeave: "/api/server/playerLeave",
        heartbeat: "/api/server/heartbeat",
        info: "/api/server/info",
        config: "/api/server/config",
        /** The game server pushing its own configuration up; see ConfigPushService. */
        settings: "/api/server/settings",
    },
} as const;
