# Deployment

## Pipeline

Each service has its own workflow. All delegate to the shared `robticorg/robtic-actions` Docker
deploy workflow on the self-hosted runner (`robtic-deploy`, `core.robtic.org`):

Dockerfile paths below are relative to `infra/docker/dockerfiles/`.

| Workflow | Trigger | Image | Dockerfile | Compose service |
|---|---|---|---|---|
| `deploy-platform-api.yml` | push to `main` | `ghcr.io/robticorg/robtic-platform-api` | `platform-api.Dockerfile` | `robtic-platform-api` |
| `deploy-bot.yml` | the platform API workflow finishing | `ghcr.io/robticorg/robtic-system` | `bot.Dockerfile` | `robtic-system` |
| `deploy-dashboard-api.yml` | push to `main` | `ghcr.io/robticorg/robtic-dashboard-api` | `dashboard-api.Dockerfile` | `robtic-dashboard-api` |
| `deploy-dashboard.yml` | the dashboard API workflow finishing | `ghcr.io/robticorg/robtic-dashboard` | `dashboard.Dockerfile` | `robtic-dashboard` |

Every Docker artefact — Dockerfiles, both Compose files, the build script — lives under
`infra/docker/`; see [`infra/docker/README.md`](../infra/docker/README.md) for the layout and for the
build contexts, which are the repository root rather than the directory the Dockerfile sits in.

Each workflow's `compose-pull-command` and `compose-up-command` name the topology explicitly:

```bash
docker compose -f infra/docker/compose/docker-compose.yml -p robtic-system \
  --env-file /home/robtic/robtic-system/.env up -d <service>
```

The `-f` is not optional any more. These commands used to run without it and resolve a
`docker-compose.yml` in the deploy working directory on the server, which is why that directory must
now contain the repository tree at `infra/docker/compose/docker-compose.yml`.

Every workflow except the bot's pulls/ups **only its own service** (full-command overrides, since
the shared workflow does not append project args to overridden commands); the bot workflow's
commands name no service at all, so its `compose pull` + `up -d` covers the whole stack — by which
point every image exists in GHCR.

### Two chains, and how they stay in order

There are two client→server pairs, and each is a chain of its own: bot → platform API, and web
dashboard → dashboard API. The client has to restart *after* the service it depends on. With two
jobs in one file that was a `needs:`; split across files it is a `workflow_run` trigger —
`deploy-bot.yml` fires when **Deploy platform API** finishes, and `deploy-dashboard.yml` when
**Deploy dashboard API** does, whatever either decided.

The two chains are independent on purpose. They share no code path and neither is a client of the
other, so serialising them would only make every dashboard change wait on a bot deploy.

- A **skipped** deploy (unchanged) still releases the client. Only a *failed* service run stops it,
  because restarting a client against a half-deployed service is worse than not restarting it.
- All four workflows share one `concurrency` group (`deploy-compose`), named after the server rather
  than the workflow, so the two chains queue behind each other on `docker compose` instead of
  racing — which is what makes running them in parallel safe.
- A chained workflow checks out `github.event.workflow_run.head_sha`, not whatever `main` points
  at now: a push landing mid-deploy would otherwise sign a different tree than the one deploying.
- The decision logic lives once, in the local composite action
  `.github/actions/deploy-decision`, so the caching rule cannot drift between the four files.

## Only what changed gets rebuilt

A push touching one service used to rebuild and redeploy everything. Now each service is
**content-addressed**.

1. Each workflow's `changes` job runs `scripts/deploy-signature.sh <service>`, which hashes every
   tracked file that can affect that image — its own source, the libs it actually uses, the
   Dockerfile, the workspace manifests, the lockfile, the shared tsconfig, and the workflows.
2. That signature is looked up in the Actions cache (`deploy-v1-<service>-<signature>`,
   `lookup-only`). **A hit means this exact content was built and deployed before**, so the job is
   skipped. A miss means it is new.
3. Services that miss build and deploy as before.
4. The `seal` job writes the marker into the cache — but only when that workflow's deploy job
   **succeeded**. A failed deploy leaves its signature unclaimed, so the next push retries it
   instead of skipping a service that never shipped.

| Service | Signature covers |
|---|---|
| `bot` | `infra/docker/dockerfiles/bot.Dockerfile` · `apps/bot` · `libs` · `images` |
| `platform-api` | `infra/docker/dockerfiles/platform-api.Dockerfile` · `apps/robtic-api` · `libs` |
| `dashboard-api` | `infra/docker/dockerfiles/dashboard-api.Dockerfile` · `apps/dashboard-api` · `libs` |
| `dashboard` | `infra/docker/dockerfiles/dashboard.Dockerfile` · `apps/dashboard` — **no `libs`** |

Each Dockerfile is named explicitly. Three of them used to be covered incidentally, by sitting
inside the app directory already being hashed; once they moved to `infra/docker/` that stopped being
true, and an unlisted Dockerfile is the worst thing to miss here — editing it would leave the
signature unchanged, so the deploy would be skipped as *already deployed* and the edit would never
ship.

Plus, for all four: `package.json` · `bun.lock` · `tsconfig.json` · `.dockerignore` ·
`apps/*/package.json` · `libs/*/package.json` · `.github/workflows/deploy-*.yml` ·
`scripts/deploy-signature.sh` · `infra/docker/compose/docker-compose.yml`.

The production Compose file is in that list as of the `infra/docker` move, and was not before. That
was a real gap: editing a port mapping or a healthcheck changed what runs on the server while every
signature stayed identical, so the deploy that would have applied it was skipped as *unchanged*. The
local stack is deliberately absent — it never runs on the server.

Each image copies only the app it runs rather than all of `apps`, so a change confined to one app
cannot produce a different image for another and force a pointless redeploy of it. The web dashboard
goes further and omits `libs` entirely: it imports nothing from them — it is a client of
`dashboard-api` and nothing else — so a repository-wide library change leaves its image untouched.

Properties worth knowing:

- **Content, not commits.** A revert lands back on a signature that is already cached, so it
  redeploys nothing but the reverted service. Rebases and force-pushes are equally harmless.
- **Fails toward deploying.** No cache, a cleared cache, or a 7-day eviction all read as "changed",
  which costs one rebuild. There is no path where a real change reads as unchanged.
- **Skipped is not failed.** Downstream jobs check `result != 'failure'` rather than relying on
  plain `needs`, which would treat a skipped upstream as a reason to skip everything after it.
- **Force a deploy** with the **Run workflow** button on whichever workflow you want, ticking
  `force` to ignore the cache for that run.
- Run `bash scripts/deploy-signature.sh bot` locally to see the same hash the workflow computes.

## Images

- **robtic-system** — Bun runtime, runs the bot from source with the root tsconfig (path aliases resolved at runtime). Needs `images/` and repo-root `WORKDIR`. Copies `apps/bot` only — it imports nothing from the other apps.

`.dockerignore` must keep `**/node_modules` — bun installs workspace deps into per-app `node_modules`, and copying host installs into the image breaks the Linux-installed packages.

## Compose Topology (server)

```
robtic-system         (no ports — outbound Discord gateway only)
robtic-platform-api   0.0.0.0:3002 -> 3002     (owns MongoDB; bot + Minecraft servers are clients)
```

Nginx runs **on the host** and is the public entry point, publishing three origins with TLS:
`minecraft.api.robtic.org` → `127.0.0.1:3002`, `dashboard.robtic.org` → `127.0.0.1:3000`, and
`dashboard-api.robtic.org` → `127.0.0.1:3003`.

Where a service binds to `127.0.0.1:`, that prefix is deliberate and should not be removed. A
connection refused from another machine on the LAN is that binding working correctly — if a
public URL fails, the fault is in the Nginx vhost or DNS, not the port mapping.

→ **[deployment-nginx.md](./deployment-nginx.md)** — vhost configuration, the full diagnostic
ladder, and how to localise a failure to the container, Nginx or DNS.

## Required Configuration

**Server env file** (`/home/robtic/robtic-system/.env`), in addition to the bot variables:
- `ROBTIC_API_PORT` — optional, defaults to 3002. If changed, the port mapping in
  `infra/docker/compose/docker-compose.yml` and the Nginx `proxy_pass` must change with it.

Dashboard stack — all required before `robtic-dashboard-api` will start, which it announces by
name rather than failing later at the first login attempt:

| Variable | |
|---|---|
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | The OAuth application. Add `https://dashboard-api.robtic.org/auth/callback` to its redirects. |
| `DISCORD_BOT_TOKEN` | Reads a guild's roles and channels for the settings pickers. |
| `DASHBOARD_SESSION_SECRET` | Signs session cookies. Rotating it signs everybody out — the intended emergency stop. |
| `DASHBOARD_API_URL` | `https://dashboard-api.robtic.org` — the OAuth redirect is built from it. |
| `DASHBOARD_URL` | `https://dashboard.robtic.org` — the API's single permitted CORS origin. |
| `DASHBOARD_PUBLIC_API_URL` | `https://dashboard-api.robtic.org` — what the web app tells the browser to call. |

`DASHBOARD_URL` and the web origin must match exactly, scheme included. They are a CORS pair, and a
mismatch is rejected by the browser before the request ever reaches the server — which reads as
"saving does nothing" with no log line anywhere.

Nothing here is baked into an image. `DASHBOARD_PUBLIC_API_URL` is read at request time, so the same
`robtic-dashboard` digest runs in any environment and a wrong URL is a restart, not a rebuild.

**GitHub secret**: `DISCORD_WEBHOOK_DEPLOY` (already configured) — deploy notifications for each job.

## Monitors

`scripts/monitor/` (PM2 crash + memory monitors) run on the host, outside the container lifecycle.
