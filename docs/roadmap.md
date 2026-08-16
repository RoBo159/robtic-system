# Roadmap

## Phase 1 — Monorepo Structure ✅

- Bun workspaces (`apps/*`, `libs/*`)
- Bot moved to `apps/bot`; core/database/types split into `libs/`
- Scaffolds for `apps/dashboard`, `libs/sdk`, and future extraction libs
- Documentation set under `docs/`

## Phase 2 — Library Extraction

- Move `libs/core/src/config` → `libs/config` (env, discord, database, feature flags) and update the `@core/config` alias consumers.
- Move `libs/core/src/utils` pure helpers → `libs/utils`; keep business-flavored utilities in `libs/core`.
- Move `libs/core/src/libs/logger` → `libs/logger` behind an interface so every app can reuse it.
- Begin `libs/constants`: migrate `constants.ts`, embed titles/descriptions, button labels, limits, cooldowns, regexes out of feature code.
- Extract per-feature business logic out of `apps/bot/src/*/services` into `libs/core` feature modules (combo, streak, xp, moderation), leaving thin Discord adapters in the bot.

## Phase 3 — Code-Level Standards

- One function per file across the codebase (enforced for new code now).
- Remove remaining hardcoded strings/numbers from command and component files.
- Strip non-documentation comments; keep JSDoc on interfaces/types/constants only.
- Dead-code sweep (duplicate `welcome`/`note` prefix-command name collision, unused exports).

## Phase 4 — Platform

- `libs/events` + WebSocket gateway for live data.
- `apps/dashboard`: guild configuration UI replacing config slash-commands.
- `libs/cache`: Redis for hot-path caches currently held in process memory (combo partner cache, cooldowns) once multiple processes exist.

## Phase 5 — Distribution

- Desktop/mobile clients consuming the same API.
- CLI for operational tasks (deploy checks, config dumps).
