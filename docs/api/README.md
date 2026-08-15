# API Documentation

`apps/api` backs the Discord Activity. It is a single `Bun.serve` handler with explicit path
matching — no framework, no router library — delegating to `libs/core` services so the bot and the
web panel always compute the same answer from the same code.

Not to be confused with `apps/robtic-api`, which is the **Minecraft** API (API-key auth, coin
wallet, item prices, sale settlement). See [bot/minecraft.md](../bot/minecraft.md) for that one.

- Port: `API_PORT`, default `3001`
- Auth: every route except `/api/token` and `/api/health` calls `authenticateRequest` with the
  Activity's bearer token
- Errors: `{ error }` JSON with the usual status codes

## Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/token` | Discord OAuth2 → Activity token exchange |
| GET | `/api/health` | Liveness |
| GET | `/api/profile[/:userId]` | Profile snapshot; omit the id for the caller's own |
| GET | `/api/profile/:userId/details` | The dropdown sections: activity, staff, notes, projects, punishments |
| POST | `/api/profile/customize` | Colors, banner, bio, template |
| GET | `/api/search?guildId=&q=` | User autocomplete |
| GET | `/api/top` | Leaderboard page |
| GET · POST | `/api/settings` | Per-user settings (privacy, language) |
| GET · POST | `/api/admin/config` | Guild config snapshot / one-section write |
| POST | `/api/admin/moderate` | Moderation actions from the panel |
| GET · POST | `/api/admin/bot-profile` | Bot nickname, avatar, presence |
| GET · POST | `/api/bot-admin/config` | Bot-wide settings, super users only |
| GET | `/api/projects/mine` · POST `/api/projects` | Project sharing |

## `/api/profile`

Returns `ProfileSnapshot` (`libs/types/src/profile.ts`) plus a `partners` map resolving the combo
partner ids to names and avatars. Sections: `xp`, `streak`, `combo`, `voice`, `points`, `coins`,
`badges`, `customization`.

`voice` reports connected time, active time, voice XP, session count, longest and average session,
and rank by active time — all durations in **seconds**. `points` reports the balance, lifetime
earned, RC, and rank. See [bot/voice.md](../bot/voice.md) and [bot/economy.md](../bot/economy.md).

The whole snapshot comes from `getProfileSnapshot` in `libs/core`, which is also what the bot's
`/profile` embed renders — adding a field there surfaces it on both at once.

## `/api/top`

`?guildId=&category=&period=&page=&pageSize=`

Categories come from `TOP_CATEGORIES`: `streak`, `combo`, `xp`, `messages`, `voice`, `points`,
`coins`. Periods from `COMBO_LEADERBOARD_PERIODS`: `daily`, `weekly`, `monthly`, `alltime`. Both
fall back to the first valid value rather than erroring. `voice` ranks on **seconds of active
time**, so clients must format it as a duration.

The response includes the viewer's own row even when it falls outside the requested page.

## `/api/admin/config`

`GET ?guildId=` returns an `AdminConfigSnapshot` — every editable section at once.
`POST { guildId, section, values }` writes exactly one section and returns the re-read snapshot, so
the client renders what was actually persisted after clamping.

Sections are `ADMIN_CONFIG_SECTIONS`, the single list both the route allowlist and the
`AdminConfigSection` type derive from:

`server` · `xp` · `streak` · `combo` · `punish` · `logs` · `points` · `voice` · `features` ·
`rejoinRoles`

Adding a section means adding it there, to `AdminConfigSnapshot`/`AdminConfigUpdate`, and to the
two switch statements in `libs/core/src/admin-config/`. The route needs no change.

**Every value is re-validated server-side** in `update-admin-config.ts` — ids are snowflake-checked
and capped, numbers are clamped to the constants in `libs/constants`. Nothing from the client is
trusted, including values the panel's own inputs already bound.

Authorization is `isGuildAdmin`: a whitelisted super user, the guild owner, a role carrying
Discord's Administrator permission, or a role in `ServerConfig.adminPanelRoles`. Resolved through
the bot token (the client cannot assert it) and cached 60s. That is deliberately *not* the same
list as `botAdminRoles`, which governs admin-access commands in chat.
