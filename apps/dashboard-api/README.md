# @robtic/dashboard-api

NestJS API behind the web dashboard. Owns Discord OAuth sessions and per-guild authorization, and
reads and writes guild configuration, moderation history, quests and economy through `libs/database`.

## Why it exists alongside `robtic-api`

`apps/robtic-api` serves machines: the bot and the Minecraft plugin, authenticated with scoped API
keys. This one serves people: a browser, authenticated with a Discord identity, where the question
on every request is "may *this human* administer *this guild*". The two have different auth models
and different consumers, so they are different services that happen to share a database layer.

## Authorization

Two layers, both required for anything guild-scoped:

1. **`SessionGuard`** — registered globally in `AppModule`. Every route needs a valid signed session
   cookie unless it carries `@Public()`. Only the OAuth handshake and the health probe do.
2. **`GuildAccessGuard`** — applied to every controller with `:guildId` in its path. Asks Discord
   whether the visitor holds Manage Server (or owns the guild) **and** whether the bot is in it.

The second check goes to Discord, not to our database, because our database has no opinion about who
administers a Discord server. A `:guildId` in a URL is attacker-controlled and is never trusted.

## Environment

| Variable | Required | Default |
|---|---|---|
| `MONGODB_URI` | yes | — |
| `DISCORD_CLIENT_ID` | yes | — |
| `DISCORD_CLIENT_SECRET` | yes | — |
| `DISCORD_BOT_TOKEN` | yes | — reads guild roles and channels |
| `DASHBOARD_SESSION_SECRET` | yes | — signs session cookies; rotating it logs everyone out |
| `DASHBOARD_API_PORT` | no | `3003` |
| `DASHBOARD_API_URL` | no | `http://localhost:3003` — the OAuth redirect is built from it |
| `DASHBOARD_URL` | no | `http://localhost:3000` — the only permitted CORS origin |
| `DASHBOARD_SESSION_TTL_MS` | no | 7 days |
| `DASHBOARD_SECURE_COOKIES` | no | true when `DASHBOARD_API_URL` is https |

Add `<DASHBOARD_API_URL>/auth/callback` to the application's OAuth2 redirects in the Discord
developer portal, or the handshake fails with a redirect-mismatch.

## Routes

| Method | Path | |
|---|---|---|
| GET | `/health` | public |
| GET | `/auth/login` · `/auth/callback` · `/auth/logout` | public — OAuth handshake |
| GET | `/auth/me` | the signed-in user |
| GET | `/guilds` | guilds this visitor can configure |
| GET | `/guilds/:id/directory` | roles and channels, for the pickers |
| GET | `/guilds/:id/settings` | prefix, features, staff tiers, command access |
| PATCH | `/guilds/:id/settings/prefix` · `/commands-channel` · `/features/:key` | |
| PUT | `/guilds/:id/settings/bot-admin-roles` · `/staff-tiers/:key/roles` | |
| GET | `/guilds/:id/moderation/cases` · `/members/:userId` · `/config` · `/audit` | read-only |
| GET | `/guilds/:id/quests/settings` · `/board` · `/community` | |
| PATCH | `/guilds/:id/quests/settings/quest-channel` · `/community-channel` · `/tiers/:tier` · `/offset` | |
| GET | `/guilds/:id/economy/leaderboard` | |

Moderation is read-only on purpose: a ban issued from a web form skips the proof flow, the approval
routing and the Discord-side role-hierarchy check that `/jail` and `/ban` run. Adding a second,
weaker path to the same action is how a moderation system ends up with cases nobody can account for.

## Running

```bash
bun install
bun --filter @robtic/dashboard-api dev
```
