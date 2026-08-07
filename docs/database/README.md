# Database Documentation

MongoDB via Mongoose 9, Bun runtime (a `preload.ts` shim stubs `v8.startupSnapshot` for BSON).

## Layer (`libs/database`)

- `connection.ts` — single connection bootstrap (`MONGODB_URI`).
- `models/` — one schema per file; documents own no behavior.
- `repositories/` — static classes, one per aggregate; the only way application code touches models. No business logic — pure data access, with atomic `findOneAndUpdate` pipelines on hot paths (e.g. `ComboRepository.applyMessage`) to avoid lost updates.

## Conventions

- Pair-keyed documents store `userLowId < userHighId` (see `Combo`).
- Guild-scoped collections index `guildId` first.
- The `Minecraft*` collections are also read and written by the Paper plugin
  (`apps/minecraft-plugin`), which hardcodes their Mongoose-pluralised names in
  `MongoCollections.java` — renaming one of those models means updating that file too. See
  [bot/minecraft.md](../bot/minecraft.md).
- Config-style collections (`ServerConfig`, `LogConfig`, `BotConfig`) are being consolidated — see memory of ongoing migration in the codebase docs.

Per-collection documentation will be added here as schemas stabilize.
