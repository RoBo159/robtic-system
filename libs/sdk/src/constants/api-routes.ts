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

    /**
     * Robs — the Minecraft currency. Addressed by Minecraft UUID throughout.
     *
     * There is deliberately no coin route here. Discord coins are a separate currency that the game
     * server has no access to, and the two are never converted into one another.
     */
    robs: {
        balanceOf: (uuid: string) => `/api/robs/balance/${encodeURIComponent(uuid)}`,
        balancePattern: /^\/api\/robs\/balance\/([0-9a-fA-F-]{32,36})$/,
        /** Batch read, so a placeholder refresh is one request rather than one per player. */
        balances: "/api/robs/balances",
        add: "/api/robs/add",
        remove: "/api/robs/remove",
        sell: "/api/robs/sell",
        prices: "/api/robs/prices",
        history: "/api/robs/history",
        leaderboard: "/api/robs/leaderboard",
    },

    /**
     * Survival quality-of-life: spawn, homes, friends, chests, cosmetics and `/back`.
     *
     * Grouped under one prefix because they share an audience and a shape — every one is addressed
     * by Minecraft UUID and every one is read through the plugin's cache rather than per command.
     */
    survival: {
        spawn: "/api/survival/spawn",

        homes: "/api/survival/homes",
        setHome: "/api/survival/homes/set",
        deleteHome: "/api/survival/homes/delete",
        renameHome: "/api/survival/homes/rename",

        friends: "/api/survival/friends",
        friendAction: "/api/survival/friends/action",

        back: "/api/survival/back",
        spendBack: "/api/survival/back/spend",

        locks: "/api/survival/chests/locks",
        lock: "/api/survival/chests/lock",
        unlock: "/api/survival/chests/unlock",
        lockAt: "/api/survival/chests/at",
        portableChest: "/api/survival/chests/portable",
        linkChest: "/api/survival/chests/portable/link",

        /**
         * Every player preference in one place: friend teleports, lobby behaviour and cosmetics.
         *
         * These were three endpoints — `/cosmetics`, `/cosmetics/set` and `/friends/settings` —
         * all writing the same `MinecraftPlayerPrefs` document. One document, one endpoint.
         */
        settings: "/api/survival/settings",
        setSettings: "/api/survival/settings/set",

        /** The lobby's read-only survival inventory preview. */
        inventorySnapshot: "/api/survival/inventory-snapshot",

        profile: "/api/survival/profile",
        entitlements: "/api/survival/entitlements",
        stats: "/api/survival/stats",
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

        /** Report lifecycle: claiming, closing, and the counts the placeholders cache. */
        claimReport: "/api/staff/reports/claim",
        closeReport: "/api/staff/reports/close",
        reportCounts: "/api/staff/reports/counts",

        /**
         * Staff roster changes: add, promote, demote, set role, fire.
         *
         * One endpoint taking the action, because all five do the same two things — write an audit
         * event and mirror the Discord role. The rank *ordering* is the game server's, so it sends
         * the resolved outcome exactly as `/staff promote` already does.
         */
        manageStaff: "/api/staff/manage",
        backup: "/api/staff/backup",
        /** Called once the plugin has actually restored a snapshot, so the backup can be dropped. */
        confirmRestore: "/api/staff/confirm-restore",
    },

    discord: {
        roles: "/api/discord/roles",
        /** Minecraft → Discord: the game server reports groups, the API applies the roles. */
        syncRoles: "/api/discord/sync-roles",
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
