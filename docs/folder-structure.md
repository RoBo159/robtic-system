# Folder Structure

```
apps/
    bot/
        src/                     One bot, one client. Each top-level folder is a kind; the
                                 absorbed systems keep a namespaced subfolder inside it.
            index.ts             Entrypoint: DB connect + ClientManager bootstrap
            commands/            Slash + prefix commands (community/ dev/ hr/ moderation/ modmail/)
            components/          Button/select/modal handlers (dev/ hr/ moderation/ modmail/)
            events/              Gateway listeners (community/ moderation/ modmail/)
            services/            Background work and schedulers (community/)
            utils/               Helpers, plus the shared pipeline: access/, interaction/,
                                 prefix/, help/, lang/, server-log/, staff-activity/
            guards/              Server whitelist enforcement
            handlers/            Modmail in-thread command handlers
            sessions/            Modmail pending-session state
            config/              Static ticket configuration
    activity/                    Discord Embedded Activity scaffold (React/Vite/SDK)
    dashboard/                   Web dashboard scaffold
    api/                         REST + WebSocket scaffold
    minecraft-plugin/            Paper plugin (Java/Maven) — Minecraft client for the shared MongoDB
        src/main/java/org/robtic/minecraft/
            config/              Immutable config.yml snapshot
            persistence/         MongoProvider, collection names, repositories
            service/             Linking, prices, exchange, chat bridge, status, LuckPerms sync
            gui/                 Exchange menus and their controller
            listener/            Connection, chat, menu clicks, NPC interaction
            command/             /link, /coins, /exchange, /robtic

libs/
    core/
        src/
            bot-client.ts        Discord.js client wrapper
            client-manager.ts    Client lifecycle: initialize, start, reload
            module-loader.ts     Dynamic command/event/component loading
            ai/                  Groq-backed analyzers and prompts
            config/              BOT_DEFINITION, BRANCH_CONFIG, constants (extraction pending)
            handlers/            Error handling
            libs/                Logger, health, permissions (extraction pending)
            utils/               Core utilities (extraction pending)
    database/
        src/
            connection.ts
            models/              Mongoose schemas
            repositories/        Static-class repositories, one per aggregate
    types/                       Shared ambient types (bot.d.ts)
    sdk/                         Discord Embedded App SDK layer (structure only)
        src/{authentication,client,commands,events,utilities,types}/
    config/                      Scaffold — future home of configuration
    constants/                   Scaffold — future home of all static values
    utils/                       Scaffold — future home of pure utilities
    logger/                      Scaffold — future logging abstraction
    cache/                       Scaffold — Redis / pub-sub
    events/                      Scaffold — shared event definitions
    shared/                      Scaffold — misc reusable helpers

docs/
    architecture.md, folder-structure.md, coding-style.md, contributing.md,
    deployment.md, development.md, roadmap.md
    sdk/                         Activity + SDK architecture docs
    api/                         API docs
    database/                    Database docs
    bot/                         Feature docs (ads, combo, modal, streak)

scripts/
    monitor/                     PM2 crash monitor, memory monitor

images/                          Bot-attached assets (cwd-relative at runtime)
```

## Conventions

- Folders: lowercase. Files: kebab-case. Functions: camelCase. Types/interfaces/enums: PascalCase. Constants: UPPER_SNAKE_CASE.
- Organized by kind first (`commands/`, `events/`, `components/`, `services/`, `utils/`), then by
  system for the five that were merged in from separate bots.
- `index.ts` barrels only where they genuinely shorten imports (`@core/config`, `@core/libs`, `@database/repositories`, `@database/models`).
