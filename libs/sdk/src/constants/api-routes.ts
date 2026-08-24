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

        /**
         * One finished AFK session: the time it lasted and the robs it earned.
         *
         * Separate from `stats` because it settles two things at once — the AFK totals and a credit
         * to the balance — and the game server must be able to do both in a single request. It has
         * exactly one chance: the other end of an AFK session is very often a disconnect, and a
         * second call after the first would be made on behalf of a player who no longer exists.
         */
        afkSession: "/api/survival/afk",
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
         * Accepting or refusing a report — the two ways one ends.
         *
         * Separate from `closeReport` because accepting does more than change a status: it opens a
         * jail sentence against the reported player and posts mail to both sides. Folding that into
         * the generic close would make "close this report" mean two very different things depending
         * on an argument.
         */
        decideReport: "/api/staff/reports/decide",
        /** Resolve a six-digit code to the full report, for `/report accept <id>`. */
        reportByCode: "/api/staff/reports/by-code",

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

    /**
     * The in-game mailbox.
     *
     * Its own prefix rather than living under `staff`, because it is a player-facing feature: staff
     * write to it, but a player reading their own mail is not a staff action and should not need a
     * key scoped for one.
     */
    mail: {
        inbox: "/api/mail",
        pending: "/api/mail/pending",
        read: "/api/mail/read",
    },

    /**
     * RobticAuth — the game server's half of Discord-first authentication.
     *
     * Its own prefix, and deliberately not under `minecraft` beside the linking routes. Linking
     * answers "who is this player on Discord?" and is read by half the platform; authentication
     * answers "is this really them, right now?" and is the only thing on the network that a password
     * ever touches. Keeping the two apart is what lets the auth routes be reasoned about — and
     * audited — on their own.
     */
    auth: {
        /** The join read: linked, has a password, live session — everything, in one call. */
        state: "/api/auth/state",
        login: "/api/auth/login",
        resumeSession: "/api/auth/session/resume",
        logout: "/api/auth/logout",
        /** Issues the recovery code the *Forgot Password* button shows. */
        recovery: "/api/auth/recovery",
        /** Force link, force unlink, reset password, reset session, list sessions. */
        admin: "/api/auth/admin",
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
