# Folder Structure

```
apps/
    bot/
        src/
            index.ts             Entrypoint: DB connect + ClientManager bootstrap
            preload.ts           Bun preload shim (BSON/v8 startupSnapshot stub)
            community/           XP, levels, decay, staff activity, support analysis
            dev/                 Project tracking and review flows
            hr/                  Staff management, interviews, promotions, warns
            main/                System controller: combo, streak, ads, partners, profiles, panels
            moderation/          Punishments, tickets, audit logging, security rules
            modmail/             User-staff DM threads, appeals, reports, tags
            shared/              Cross-bot events, guards, helpers, emoji/message JSON
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
            BotClient.ts         Discord.js client wrapper
            ClientManager.ts     Multi-bot lifecycle, token merging
            ModuleLoader.ts      Dynamic command/event/component loading
            ai/                  Groq-backed analyzers and prompts
            config/              BOT_DEFINITIONS, BRANCH_CONFIG, constants (extraction pending)
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
- Feature-based organization inside each bot: `commands/`, `events/`, `components/`, `services/`, `utils/`.
- `index.ts` barrels only where they genuinely shorten imports (`@core/config`, `@core/libs`, `@database/repositories`, `@database/models`).
