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

- Commands export a default `CommandConfig` (`data` + `run`); components export `ComponentHandler`s keyed by `customId` (string or RegExp); events export `{ name, once?, execute }`. `ModuleLoader` discovers all three by folder convention.
- Repositories are static classes over Mongoose models; atomic update pipelines are preferred over read-modify-write for hot paths.
