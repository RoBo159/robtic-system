# Deployment

## Pipeline

Each service has its own workflow. Both delegate to the shared `robticorg/robtic-actions` Docker
deploy workflow on the self-hosted runner (`robtic-deploy`, `core.robtic.org`):

| Workflow | Trigger | Image | Dockerfile | Compose service |
|---|---|---|---|---|
| `deploy-platform-api.yml` | push to `main` | `ghcr.io/robticorg/robtic-platform-api` | `apps/robtic-api/Dockerfile` | `robtic-platform-api` |
| `deploy-bot.yml` | the platform API workflow finishing | `ghcr.io/robticorg/robtic-system` | `Dockerfile` | `robtic-system` |

The platform API workflow pulls/ups **only its own service** (full-command overrides, since the
shared workflow does not append project args to overridden commands); the bot workflow runs the
default full `compose pull` + `up -d`, by which point every image exists in GHCR.

### Why two workflows, and how they stay in order

The bot is a client of the platform API, so the API has to be up first. With the two jobs in one
file that was a `needs:`; split across files it is a `workflow_run` trigger — `deploy-bot.yml`
fires when **Deploy platform API** finishes, whatever it decided.

- The API workflow **skipping** its deploy as unchanged still releases the bot. Only a *failed*
  API run stops it, because restarting the bot against a half-deployed API is worse than not
  restarting it.
- Both workflows share one `concurrency` group (`deploy-compose`), named after the server rather
  than the workflow, so a manual run of one queues behind the other instead of racing on
  `docker compose`.
- The bot workflow checks out `github.event.workflow_run.head_sha`, not whatever `main` points at
  now: a push landing mid-deploy would otherwise sign a different tree than the one deploying.
- The decision logic lives once, in the local composite action
  `.github/actions/deploy-decision`, so the caching rule cannot drift between the two files.

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
| `bot` | `Dockerfile` · `apps/bot` · `libs` · `images` |
| `platform-api` | `apps/robtic-api` (incl. its Dockerfile) · `libs` |

Plus, for both: `package.json` · `bun.lock` · `tsconfig.json` · `.dockerignore` ·
`apps/*/package.json` · `libs/*/package.json` · `.github/workflows/deploy-*.yml` ·
`scripts/deploy-signature.sh`.

The bot image copies `apps/bot` rather than all of `apps`, so a change confined to another app
cannot produce a different bot image and force a pointless redeploy of it.

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

Nginx runs **on the host** and is the public entry point, publishing the platform API origin
(`minecraft.api.robtic.org` → `127.0.0.1:3002`) with TLS.

Where a service binds to `127.0.0.1:`, that prefix is deliberate and should not be removed. A
connection refused from another machine on the LAN is that binding working correctly — if a
public URL fails, the fault is in the Nginx vhost or DNS, not the port mapping.

→ **[deployment-nginx.md](./deployment-nginx.md)** — vhost configuration, the full diagnostic
ladder, and how to localise a failure to the container, Nginx or DNS.

## Required Configuration

**Server env file** (`/home/robtic/robtic-system/.env`), in addition to the bot variables:
- `ROBTIC_API_PORT` — optional, defaults to 3002. If changed, the port mapping in
  `docker-compose.yml` and the Nginx `proxy_pass` must change with it.

**GitHub secret**: `DISCORD_WEBHOOK_DEPLOY` (already configured) — deploy notifications for each job.

## Monitors

`scripts/monitor/` (PM2 crash + memory monitors) run on the host, outside the container lifecycle.
