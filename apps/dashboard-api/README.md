# @robtic/dashboard-api

NestJS API behind the web dashboard: Discord OAuth sessions, per-guild authorization, and read/write
access to guild configuration, moderation history, quests and economy.

```bash
bun --filter @robtic/dashboard-api dev          # watch mode
bun --filter @robtic/dashboard-api typecheck
bun --filter @robtic/dashboard-api test:routes  # builds the app, asserts routes and guards
```

## Layout

Organised by **feature first, kind second**. Every feature folder has the same internal shape, so
knowing where a controller lives in one module tells you where it lives in all of them.

```text
src/
├── main.ts                  bootstrap: validate env, connect Mongo, CORS, pipes, listen
├── app.module.ts            composition root — imports only, no controllers of its own
│
├── config/                  the environment, validated once and exposed as typed namespaces
│   ├── configuration.ts         registerAs("app" | "database" | "discord" | "session")
│   ├── env.validation.ts        the schema — the only file that knows variable names
│   ├── configuration.module.ts  @Global ConfigModule.forRoot
│   └── interfaces/
│
├── common/                  used by two or more features; nothing speculative
│   ├── constants/  decorators/  dto/  filters/  interfaces/  utils/
│
├── auth/                    sessions, OAuth, and both guards
│   ├── controllers/  services/  guards/  decorators/  dto/  interfaces/  constants/
│   └── auth.module.ts
│
├── guilds/                  the guild picker and the role/channel directory
├── settings/                guild configuration
├── moderation/              cases, member records, audit trail — read-only
├── quests/                  quest settings, board, community challenge
├── economy/                 the coin leaderboard
└── health/                  the container probe
    └── each: controllers/ services/ repositories/ dto/ <feature>.module.ts

test/
└── route-check.ts           builds the app without a database or a port
```

## Dependency direction

```text
Controller  →  Service  →  Repository  →  MongoDB / Discord
```

Enforced, not just described:

- **Controllers hold no business logic.** They read parameters, call one service method, and return.
  Nothing in `src/*/controllers/` builds a query, maps a document, or reaches for `@database/*`.
- **Services never touch mongoose.** `settings/`, `moderation/`, `quests/` and `economy/` each own a
  repository that wraps the static `@database/repositories` classes. Those statics are shared with
  the bot and cannot be injected; wrapping them puts a seam back where a service can be given a fake.
- **`common/` depends on nothing.** Features depend on `common/` and on `auth/`; never the reverse.
  `@Public()` lives in `common/` so any controller can declare itself open, while `SessionGuard`,
  which enforces it, stays in `auth/`.

`auth/` and `config/` are `@Global()`. Every other module declares no `imports` at all — that is the
intended shape, not an omission.

## Security invariants

These are the reasons this service exists in front of the database, and each is checked by
`test/route-check.ts` rather than left to review:

| Invariant | Enforced by |
|---|---|
| Every route needs a session unless it says otherwise | `SessionGuard` as `APP_GUARD`; opt out with `@Public()` |
| Every guild-scoped route checks Manage Server against Discord | `GuildAccessGuard` on each guild-scoped controller |
| Moderation exposes no writes | asserted against the live route table |
| Only the OAuth handshake and the health probe are public | asserted per handler |

`GET /guilds` is the one guild-ish route without `GuildAccessGuard`, and deliberately: it names no
guild — it is the route that *tells* a visitor which guilds they may open, filtered by their own
Discord token.

## Configuration

Variables are declared once, in `config/env.validation.ts`, and read everywhere else through a typed
namespace:

```ts
constructor(@Inject(sessionConfig.KEY) private readonly config: ConfigType<typeof sessionConfig>) {}
```

A service therefore receives only the section it needs. `ignoreEnvFile` is on: every deployment
supplies real process environment variables, and letting @nestjs/config also hunt for a `.env`
relative to the working directory would mean the service read different values depending on where it
was started from.

Missing or malformed variables fail at startup with a message naming each one. See `.env.example`.

## Known follow-ups

- `DiscordService` issues `fetch` calls with no timeout. A hung Discord API hangs the request. Adding
  `AbortSignal.timeout` is a behaviour change and was left out of the structural refactor.
- `DASHBOARD_SESSION_SECRET` is validated as non-empty, not as long enough to be a real HMAC key. A
  minimum length would be right, and would hard-fail the next deploy if the live secret is short — so
  it needs a secret rotation, not just a code change.
