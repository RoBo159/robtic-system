# Coding Style

## Naming

| Kind | Convention | Example |
|---|---|---|
| Folders | lowercase | `services/` |
| Files | kebab-case | `combo-service.ts` |
| Functions | camelCase | `processComboMessage` |
| Types / Interfaces / Enums | PascalCase | `BotDefinition`, `ComboStatus` |
| Constants | UPPER_SNAKE_CASE | `COMBO_CONFIG`, `STREAK_IMAGES_DIR` |

## Rules

- **TypeScript strict mode** — no `any` unless interfacing with untyped third-party events.
- **One function per file** is the target for new code; existing multi-function files are migrated opportunistically (see `docs/roadmap.md`).
- **No hardcoded values** in new code — static values belong in `libs/constants` (interim: `libs/core/src/config`). Branch-specific IDs belong in `BRANCH_CONFIG`.
- **No duplicate logic** — search before writing; extract shared helpers into the appropriate lib.
- **Comments** are reserved for interface/type/constant documentation (JSDoc) and constraints the code cannot express. No TODOs, no commented-out code, no narration.
- **Imports** — use path aliases (`@core/*`, `@database/*`, `@bot/*`, `@types/*`); never deep-relative imports across package boundaries. Remove unused imports.
- **Dependency direction** — `apps → libs`; `libs/database` holds no business logic; libs never import apps.

## Discord Patterns

- **File suffixes are reserved.** `*.command.ts`, `*.event.ts`, `*.component.ts` and `*.message.ts`
  are registered by the loader wherever they sit under `apps/bot/src`. Never give a helper one of
  those names — a stray `*.event.ts` in `utils/` attaches a live gateway listener.
- Commands default-export a `CommandConfig` (`data` + `run`), or an array of them. Events
  default-export an `EventConfig` (`{ name, once?, execute }`) or an array. Components
  default-export a `FeatureComponentIndex`, or export handlers under any name.
- **New components use `feature:action:arg` custom ids.** Three older conventions coexist
  (`a:b:c`, `a_b_c`, `a-b-c`) and must be left alone: a live message in a channel carries its custom
  id in Discord's data, so renaming a handler permanently orphans every message already posted.
- **Permission checks read from `member`, never from the interaction.** Both a real interaction and
  the prefix stand-in from `build-fake-interaction.ts` reach `checkPermissions`, and the stand-in
  has no `memberPermissions`, `appPermissions`, `locale` or `commandGuildId`.
- **A feature owns nothing outside its folder.** Deleting `features/<key>/` must be a directory
  removal with no other edit, so nothing outside may import from inside it — including
  `events/client-ready.ts`, which is why features start their own schedulers.
- Repositories are static classes over Mongoose models; atomic update pipelines are preferred over
  read-modify-write for hot paths. Anything read inside `checkPermissions` must be cached — it runs
  before `deferReply()`, inside Discord's ~3s acknowledgement window.
