# Architecture

Robtic System is a Bun-workspaces monorepo that today runs a Discord bot and is structured to grow into the backend foundation of the Robtic Platform (bot, embedded activity, dashboard, REST API, websocket, and future desktop/mobile/CLI clients).

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
| `apps/bot` | **Live** | The Discord bot — one client running every system (admin, moderation, community, dev, minecraft) |
| `apps/activity` | Scaffold | Discord Embedded Activity (React + Vite + Discord Embedded App SDK) |
| `apps/dashboard` | Scaffold | Web dashboard |
| `apps/api` | Scaffold | REST + WebSocket backend exposing `libs/core` services |
| `apps/minecraft-plugin` | **Live** | Paper plugin (Java/Maven) — a Minecraft client for the same MongoDB, see [bot/minecraft.md](bot/minecraft.md) |

## Libraries

| Lib | Status | Purpose |
|---|---|---|
| `libs/core` | Live | Bot client infrastructure (`BotClient`, `ClientManager`, module loader, feature registry), AI clients, config, core utilities |
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

1. `apps/bot/src/index.ts` connects the database (`libs/database`), preloads the super-user and allowed-guild caches, and points `ClientManager` at its module root (`setBotModulesRoot`).
2. `ClientManager` creates the single `BotClient` from `BOT_DEFINITION` and calls `loadModules` (`libs/core/src/loader/`), which walks `apps/bot/src` once and registers everything it finds.
3. On `clientReady` the bot sets its presence, enforces the server whitelist (`guards/`), and starts every scheduler. Features start their own schedulers from their own `clientReady` listener.

### Module loading

One filesystem walk, classified by `classify-module-file.ts`. A file is registered if it either
carries a reserved suffix — **anywhere** in the tree — or sits directly in one of the legacy
directories:

| Rule | Registered as |
|---|---|
| `*.command.ts` | Slash / context-menu command |
| `*.event.ts` | Gateway listener |
| `*.component.ts` | Button, select menu or modal handler |
| `*.message.ts` | Prefix-only handler, run in front of the normal prefix pipeline |
| `features/<key>/<key>.ts` | Feature manifest |
| unsuffixed under `commands/`, `events/`, `components/` | Legacy, pending the move to suffixes |

The four suffixes are **reserved**: renaming a helper to `*.event.ts` anywhere under `apps/bot/src`
attaches a real gateway listener. Everything else inside a feature folder — `commands/`,
`functions/`, `utils/`, `lib/`, `components/` — is a plain import from its own feature and invisible
to the loader.

Files are imported at most once and in a deterministic order (manifests, then suffixed, then
legacy; alphabetical within each). Two commands sharing a name is therefore a rule rather than a
race: the first registration wins and the collision is logged naming both files. That is what makes
migrating a feature safe — add `features/coins/`, verify it beats the old `commands/coins.ts`, then
delete the old file.

### Features

A system becomes `apps/bot/src/features/<key>/` when it has **at least two of**: subcommands, its
own gateway events, two or more components, its own scheduler. Otherwise it is a single
`*.command.ts` in the scope tree.

**Deleting a feature must be `rm -rf features/<key>/` and nothing else.** No central registry
enumerates features, and no file outside a feature may import from inside one. This is why a
feature starts its scheduler from its own `clientReady` listener rather than being called from
`events/client-ready.ts`.

Guilds turn features on and off with `/feature`. The manifest's `activation` decides the default
when a guild has expressed no preference: `default-on` works the moment the bot joins, `opt-in`
waits for `/feature enable <key>`. The gate is applied to commands (both slash and prefix), to
component handlers, and inside each feature's own listeners and schedulers.

### Command scopes

`scope` decides where a command registers; `access` decides who may run a `guild`-scoped one.

| `scope` | Registers to | Gate |
|---|---|---|
| `global` | The main route | Normal chain |
| `guild` | The main route | Normal chain, plus `access` |
| `admin` | Only the guild set by `!admin-guild` | Super users only, above every other bypass |

With no admin guild configured, admin commands are published nowhere and stay reachable by prefix —
the prefix router resolves against the loaded command collection, never Discord's registry. That is
what lets `!admin-guild set <id>` bootstrap the setting, and why skipping registration is safe
rather than a fallback to `COMMAND_GUILD_ID`.

`access` values `general` and `games` gate nothing; only `admin` does, adding server Administrators
and `ServerConfig.botAdminRoles` as a way in and refusing everyone else.

### Module resolution

Path aliases are defined once in the root `tsconfig.json` and respected by both `tsc` and the Bun runtime:

```
@bot/*       apps/bot/src/*
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

## Permissions

The chain in `apps/bot/src/utils/interaction/check-permissions.ts`, in precedence order:

1. `SUPER_ADMIN_ID` — the bot owner, read from the `BOT_OWNER_ID` environment variable. The one
   identity that bypasses everything. Unset means nobody holds it, which is a safe default.
2. **`scope: "admin"` — a hard gate.** Super users only; nothing below may grant it. Placed here,
   above the whitelist short-circuit, so `isGuildOperator`, a `/command-access` grant and a
   lead-tier score all fail to open it. Above the guild-only branch too, so a super user can run
   these in DMs and everyone else is told the real reason.
3. `SuperUser` whitelist — cross-guild, managed by `/whitelist`, cached in memory.
4. `isGuildOperator(member)` — the server's own operator: guild owner, Discord Administrator, or a
   whitelisted super user. **Synchronous**, and must stay that way: every caller is sync and several
   sit in hot moderation paths.
5. `CommandAccess` — per-guild, per-command role and tier grants (`/command-access`).
6. `StaffTier` — per-guild role→score bindings; a score of `lead` or above passes everything, and
   `requiredPermission` on a command is compared against it.
7. **`access: "admin"` — a final refusal.** Everything above is a grant, so reaching here means
   none matched; under `access: "admin"` that becomes a denial rather than the permissive
   fallthrough an untagged command gets. In practice it only adds `ServerConfig.botAdminRoles`,
   since step 4 already admitted Administrators.

There are no departments. Staff structure is a flat per-guild score ladder, because a fixed
department taxonomy cannot describe every server the bot runs in.

## Known single-guild coupling

`BRANCH_CONFIG` (`libs/config/src/branch.ts`) no longer feeds the permission chain, but four
subsystems still read hardcoded IDs from it and need per-guild configuration before the bot is
genuinely multi-server:

| Subsystem | Reads | Notes |
|---|---|---|
| Punishments | `roles.memberPunishments`, `roles.staffPunishments` | Punishment-level roles per tier |
| Languages | `roles.lang.{en,ar}` | A per-guild equivalent already exists in `ServerConfig.roles` |
| Tickets | `roles.ticketSupport`, `roles.ticketAdmin`, `channels.ticketCategory`, `channels.ticketSupportReport` | Needs a `TicketConfig` model |
| Rules panel | `roles.members` | Also available on `ServerConfig.roles` |
