# Architecture

Robtic System is a Bun-workspaces monorepo that today runs a multi-bot Discord application and is structured to grow into the backend foundation of the Robtic Platform (bot, embedded activity, dashboard, REST API, websocket, and future desktop/mobile/CLI clients).

## Layout

```
apps/       Runnable applications
libs/       Shared libraries (business logic, data, infrastructure)
docs/       All documentation
scripts/    Operational scripts (monitors, tooling)
images/     Static image assets served/attached by the bot
```

## Applications

| App | Status | Purpose |
|---|---|---|
| `apps/bot` | **Live** | Six Discord bots (main, moderation, hr, modmail, community, dev) run by a shared `ClientManager` |
| `apps/activity` | Scaffold | Discord Embedded Activity (React + Vite + Discord Embedded App SDK) |
| `apps/dashboard` | Scaffold | Web dashboard |
| `apps/api` | Scaffold | REST + WebSocket backend exposing `libs/core` services |
| `apps/minecraft-plugin` | **Live** | Paper plugin (Java/Maven) — a Minecraft client for the same MongoDB, see [bot/minecraft.md](bot/minecraft.md) |

## Libraries

| Lib | Status | Purpose |
|---|---|---|
| `libs/core` | Live | Bot client infrastructure (`BotClient`, `ClientManager`, `ModuleLoader`), AI clients, config, core utilities |
| `libs/database` | Live | Mongoose models, repositories, connection — no business logic |
| `libs/types` | Live | Shared ambient types and DTOs |
| `libs/sdk` | Scaffold | Discord Embedded App SDK integration layer |
| `libs/config` | Scaffold | Extraction target for configuration currently in `libs/core/src/config` |
| `libs/constants` | Scaffold | Extraction target for static values (messages, colors, limits, IDs) |
| `libs/utils` | Scaffold | Extraction target for pure utilities currently in `libs/core/src/utils` |
| `libs/logger` | Scaffold | Extraction target for `libs/core/src/libs/logger` |
| `libs/cache` | Scaffold | Redis caching / pub-sub (future) |
| `libs/events` | Scaffold | Shared event definitions, future websocket events |
| `libs/shared` | Scaffold | Cross-cutting helpers that fit nowhere else |

## Key Runtime Flows

### Bot startup

1. `apps/bot/src/index.ts` connects the database (`libs/database`), preloads the super-user cache, and points `ClientManager` at its module root (`setBotModulesRoot`).
2. `ClientManager` groups bot definitions by token (bots sharing a token merge into one Discord client) and uses `ModuleLoader` to dynamically import each bot's `commands/`, `events/`, and `components/` folders.
3. Shared listeners in `apps/bot/src/shared/events` are attached once per client.

### Module resolution

Path aliases are defined once in the root `tsconfig.json` and respected by both `tsc` and the Bun runtime:

```
@bot/*       apps/bot/src/*
@shared/*    apps/bot/src/shared/*
@core/*      libs/core/src/*
@database/*  libs/database/src/*
@types/*     libs/types/src/*
```

### Assets

Images are attached from `images/` resolved against `process.cwd()`. All run scripts and the Docker image execute from the repository root, which must remain true.

## Dependency Direction

```
apps/*  →  libs/core  →  libs/database
        →  libs/types
```

Libraries never import from applications. `libs/database` never imports business logic.

`apps/minecraft-plugin` sits outside the TypeScript graph entirely: it is a separate Maven build
that shares only the MongoDB schema, and it talks to the bot through a queue collection rather than
through code. Its collection names mirror the Mongoose model names in `libs/database`.
