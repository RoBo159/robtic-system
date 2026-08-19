# @robtic/dashboard

Next.js (App Router) web dashboard for the Robtic Platform.

Talks only to `@robtic/dashboard-api`. It holds no database connection and no bot token — everything
privileged happens behind the API, which is why guild roles and channels are served from
`/guilds/:id/directory` rather than fetched from Discord in the browser.

## Pages

| Route | |
|---|---|
| `/` | Landing and "Sign in with Discord" |
| `/guilds` | Servers this visitor can configure |
| `/g/[guildId]` | Overview — prefix, features, staff tiers at a glance |
| `/g/[guildId]/settings` | Prefix, commands channel, feature toggles, bot admin roles, staff tier roles |
| `/g/[guildId]/moderation` | Case history and the security audit trail (read-only) |
| `/g/[guildId]/quests` | Quest and community channels, difficulties, windows, open board |
| `/g/[guildId]/economy` | Coin leaderboard |

## Reads and writes

Reads are server components using `apiGet`, which forwards the visitor's session cookie by hand —
a server component is not the browser, so nothing attaches it automatically.

Writes are client components using `apiMutate`, which goes to the API's public URL with
`credentials: "include"`. Each save calls `router.refresh()` afterwards so the server components
re-read rather than the page trusting its own optimistic copy.

## Environment

| Variable | Default | |
|---|---|---|
| `DASHBOARD_PUBLIC_API_URL` | `http://localhost:3003` | what the **browser** is told to call |
| `DASHBOARD_API_INTERNAL_URL` | `http://localhost:3003` | what **server components** call |

Two variables on purpose: behind a proxy or in Docker, the server side reaches the API by container
name while the browser can only use the public hostname.

Both are read **at request time**, never compiled in. `NEXT_PUBLIC_*` would have been substituted by
the compiler, making the hostname a property of the image — one build per environment, a Docker
build argument to thread through CI, and a container that quietly talks to `localhost` if that
argument ever failed to arrive. `src/lib/api-config.tsx` hands the value to client components
instead, so one image runs anywhere.

## Running

```bash
bun install
bun --filter @robtic/dashboard-api dev   # terminal 1
bun --filter @robtic/dashboard dev       # terminal 2
```

## Not built yet

- Command-access editing (the read is there; the write is still `/command-access` in Discord)
- Quest mention roles, VIP roles, and window add/remove
- Community challenge settings (reward base, minimum contribution)
- Streak, combo, tickets, partnership and Minecraft sections
- Realtime updates — `libs/events` websocket definitions are unused here
