# infra/docker

Every Docker artefact in the system, in one place.

```text
infra/
└── docker/
    ├── dockerfiles/
    │   ├── bot.Dockerfile               → ghcr.io/robticorg/robtic-system
    │   ├── minecraft-api.Dockerfile      → ghcr.io/robticorg/robtic-minecraft-api
    │   ├── dashboard-api.Dockerfile     → ghcr.io/robticorg/robtic-dashboard-api
    │   ├── dashboard.Dockerfile         → ghcr.io/robticorg/robtic-dashboard
    │   └── minecraft-plugin.Dockerfile  → local only (Paper test server)
    ├── compose/
    │   ├── docker-compose.yml           production topology, deployed to core.robtic.org
    │   └── docker-compose.local.yml     developer stack
    ├── scripts/
    │   └── build.sh                     builds any one image, from anywhere in the repo
    ├── configs/                         reserved; see .gitkeep
    └── README.md
```

`infra/` is the parent on purpose: Terraform, Ansible or Kubernetes manifests get a sibling of
`docker/` rather than another top-level directory.

## Everyday commands

Run these from the repository root — the paths are baked into the root `package.json`, so nothing
here requires you to `cd` anywhere.

```bash
bun run docker:local -- up --build            # developer stack
bun run docker:local -- --profile dashboard up -d
bun run docker:local -- --profile tools up -d # mongo-express
bun run docker:local -- down

bun run docker:build dashboard-api            # one image
bun run docker:build minecraft-plugin --target jar --output type=local,dest=./target

bun run docker:prod -- config                 # lint the production topology
```

`bun run <script> -- <args>` forwards everything after `--` to `docker compose`.

## Build context

**The context is the repository root for every image except the Minecraft plugin**, whose context is
`apps/minecraft-plugin`. The Dockerfiles no longer sit next to what they build, so each names its
context in a header comment, and `scripts/build.sh` is the one place that knows the mapping.

Two path rules trip people up here, and the Compose files depend on both:

- `build.context` is resolved relative to **the Compose file's own directory** — hence `../../..`.
- `build.dockerfile` is then resolved relative to **the context**, not the Compose file. That is why
  the four root-context services use `infra/docker/dockerfiles/x.Dockerfile` while the Minecraft
  service, whose context is deeper, uses `../../infra/docker/dockerfiles/minecraft-plugin.Dockerfile`.

## What deliberately did *not* move

### `.dockerignore`

Docker reads `.dockerignore` from the **context root**, not from beside the Dockerfile. Moving these
into `infra/docker/` would silently stop them applying, and the first symptom would be a slow build
shipping `node_modules` and `.next` into an image.

| File | Applies to |
|---|---|
| `.dockerignore` (repository root) | bot, minecraft-api, dashboard-api, dashboard |
| `apps/minecraft-plugin/.dockerignore` | minecraft-plugin |

`apps/minecraft-api/.dockerignore` was **deleted** rather than moved. It never applied to anything: that
image builds from the repository root, so the root file was always the one being read.

### `apps/minecraft-plugin/local-config/`

Mounted into the Minecraft container, but it is the plugin's own configuration — an `api.yml` holding
an API key, read by the Java code beside it. It stays versioned with the code that parses it.

## Manual step on the server

The production deploy now runs

```bash
docker compose -f infra/docker/compose/docker-compose.yml -p robtic-system \
  --env-file /home/robtic/robtic-system/.env up -d <service>
```

It previously ran without `-f`, resolving a `docker-compose.yml` in the working directory on
`core.robtic.org`. **That working directory must contain this repository's tree at
`infra/docker/compose/docker-compose.yml`.** If `/home/robtic/robtic-system/` holds a hand-copied
compose file rather than a checkout, copy the new file into place at the matching path before the
next deploy, or the `pull`/`up` step fails with *no configuration file provided*.

The `.env` path is unchanged and still absolute, so nothing about secrets moved.

See [`../../docs/deployment.md`](../../docs/deployment.md) for the workflow-to-image map.
