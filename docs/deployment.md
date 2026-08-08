# Deployment

## Pipeline

Pushes to `main` trigger `.github/workflows/deploy.yml`, which runs three chained jobs, each delegating to the shared `robticorg/robtic-actions` Docker deploy workflow on the self-hosted runner (`robtic-deploy`, `core.robtic.org`):

| Job | Image | Dockerfile | Compose service |
|---|---|---|---|
| `deploy-api` | `ghcr.io/robticorg/robtic-api` | `apps/api/Dockerfile` | `robtic-api` |
| `deploy-activity` | `ghcr.io/robticorg/robtic-activity` | `apps/activity/Dockerfile` | `robtic-activity` |
| `deploy-bot` | `ghcr.io/robticorg/robtic-system` | `Dockerfile` | `robtic-system` |

The api and activity jobs pull/up **only their own service** (full-command overrides, since the shared workflow does not append project args to overridden commands); the final bot job runs the default full `compose pull` + `up -d`, by which point all three images exist in GHCR. The chain also prevents concurrent compose runs on the server.

## Images

- **robtic-system** — Bun runtime, runs the bot from source with the root tsconfig (path aliases resolved at runtime). Needs `images/` and repo-root `WORKDIR`.
- **robtic-api** — Bun runtime, runs `apps/api/src/index.ts` (token exchange + health). Copies `libs/` so future `libs/core` imports work.
- **robtic-activity** — two stages: Bun installs the workspace and runs `tsc && vite build` (the Discord client id is inlined at build time via the `VITE_DISCORD_CLIENT_ID` build arg), then `nginx:1.27-alpine` serves the static bundle. Its nginx config proxies `/api/*` to `robtic-api:3001` over the compose network, so one public origin serves the whole Activity.

`.dockerignore` must keep `**/node_modules` — bun installs workspace deps into per-app `node_modules`, and copying host installs into the image breaks the Linux-installed packages.

## Compose Topology (server)

```
robtic-system         (no ports — outbound Discord gateway only)
robtic-platform-api   127.0.0.1:3002 -> 3002   (owns MongoDB; bot + Minecraft servers are clients)
robtic-api            127.0.0.1:3001 -> 3001
robtic-activity       127.0.0.1:8080 -> 80     (depends_on robtic-api)
```

Every service binds to host loopback; Nginx runs **on the host** and is the only public entry
point. It must publish the activity origin (e.g. `activity.robtic.org` → `127.0.0.1:8080`) and the
platform API origin (`minecraft.api.robtic.org` → `127.0.0.1:3002`) with TLS. In the Discord
Developer Portal, set the Activity URL mapping `/` → the activity origin.

The `127.0.0.1:` prefixes are deliberate and should not be removed. A connection refused from
another machine on the LAN is that binding working correctly — if a public URL fails, the fault is
in the Nginx vhost or DNS, not the port mapping.

→ **[deployment-nginx.md](./deployment-nginx.md)** — vhost configuration, the full diagnostic
ladder, and how to localise a failure to the container, Nginx or DNS.

## Required Configuration

**GitHub repository variable** (Settings → Secrets and variables → Actions → Variables):
- `VITE_DISCORD_CLIENT_ID` — the Discord application client id, consumed as a build arg by `deploy-activity`.

**Server env file** (`/home/robtic/robtic-system/.env`), in addition to the bot variables:
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` — OAuth2 code exchange in `robtic-api`.
- `API_PORT` — optional, defaults to 3001. If changed, the port mapping in `docker-compose.yml` and the `proxy_pass` in `apps/activity/nginx.conf` must change with it.

**GitHub secret**: `DISCORD_WEBHOOK_DEPLOY` (already configured) — deploy notifications for each job.

## Monitors

`scripts/monitor/` (PM2 crash + memory monitors) run on the host, outside the container lifecycle.
