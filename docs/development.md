# Development

## Prerequisites

- [Bun](https://bun.sh) >= 1.1.0
- MongoDB (local instance or connection string)
- A Discord bot token

## Setup

```bash
bun install
cp .env.example .env   # fill in MONGODB_URI and the bot token
```

Non-production runs read the token from `TestBot` instead of `MainBotToken` (see `libs/config/src/bot-definitions.ts`).

The bot leaves any server that is not on the whitelist. A fresh database is seeded with the
permanent Robtic servers (`libs/constants/src/allowed-guilds.ts`); add your test server with
`!addserver <serverid>` from one that is already allowed, before inviting the bot to it.

## Commands

All commands run from the repository root (asset paths are cwd-relative):

```bash
bun run dev          # watch mode with Bun preload shim
bun run typecheck    # tsc --noEmit over apps/ and libs/
bun run build        # bundle apps/bot to dist/index.js
bun run start        # run the production bundle
```

## Workspaces

The repo uses Bun workspaces (`apps/*`, `libs/*`). Dependencies are currently hoisted to the root `package.json`; workspace manifests declare identity only. Adding a dependency: add it at the root until per-package dependency ownership lands (see `docs/roadmap.md`).

## Adding a Command / Event / Component

Drop a file into `apps/bot/src/commands/`, `events/` or `components/` — in the subfolder of the
system it belongs to, or at the root for admin-level features. `ModuleLoader` scans each tree
recursively and picks it up by convention, with no registration list to edit. Slash commands
re-register on client ready, and `/system reload` re-reads them without a restart.

## Monitors

`scripts/monitor/` contains PM2-based crash and memory monitors run outside the main process; they import status reporting from `libs/core` by relative path and are not part of the typecheck program.
