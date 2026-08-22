# Robtic System

Robtic System is a modular Discord automation platform designed for developer communities.
One bot runs every system, with each system kept as a separate module in the codebase.

## Overview

The system manages community operations, staff workflows, moderation, and service access in a
structured and automated way. It is no longer only a bot: a web dashboard, two HTTP APIs and a
Minecraft plugin are all clients of the same MongoDB-backed domain.

## Services

| Service | What it is | Runs as |
|---|---|---|
| **Bot** | The Discord client. One login, one command tree, every module. | `robtic-system` |
| **Platform API** | Owns MongoDB. The bot and every Minecraft server are its clients. | `robtic-platform-api` |
| **Dashboard API** | NestJS. Discord OAuth sessions and per-guild authorization for the web app. | `robtic-dashboard-api` |
| **Dashboard** | Next.js. Configure a guild from a browser instead of a dozen slash commands. | `robtic-dashboard` |
| **Minecraft Plugin** | Paper plugin (Java/Maven). Makes a Minecraft server another client of the same economy. | — |

## Core Components

* **Admin** – system controller, configuration manager, advertisement system, and partner server management
* **Moderation** – moderation tools, punishment logging, and the ticket system
* **HR** – staff management, recruitment, and promotions
* **ModMail** – private communication between users and staff
* **Community** – XP, activity tracking, and progression roles
* **Quests** – rotating quest board, tiers and a weekly community challenge
* **Economy** – one coin balance per person, shared across Discord and Minecraft
* **Dev** – project sharing and review

## Key Features

* Modular architecture — one client, one login, one command tree
* Web dashboard for guild configuration, moderation history, quests and the leaderboard
* Database-managed server whitelist (`!addserver <serverid>`)
* Ticket and modmail systems
* Staff management automation
* Activity and role progression system
* Advertisement ordering and management
* Partner server tracking with automatic role re-grant on rejoin
* Structured moderation logging
* Minecraft integration — account linking, one shared coin balance, in-game ore exchange, chat bridge, server status, and Discord role → LuckPerms sync

## Technology

* Bun (workspaces monorepo), TypeScript
* Discord.js v14
* NestJS (dashboard API), Next.js (dashboard)
* MongoDB via Mongoose
* Java 21 + Maven + Paper (Minecraft plugin)
* Docker Compose, GitHub Actions

## Repository Layout

```
apps/
    bot/                Discord client — every module
    robtic-api/         Platform API; owns MongoDB
    dashboard-api/      NestJS API behind the dashboard
    dashboard/          Next.js web dashboard
    minecraft-plugin/   Paper plugin (Java/Maven)

libs/                   Shared libraries: core, database, config, constants,
                        logger, sdk, types, utils, cache, events, shared

infra/
    docker/             Every Dockerfile and Compose file

docs/                   All documentation
scripts/                Operational and CI checks
```

See [docs/folder-structure.md](docs/folder-structure.md) for the full tree, and
[docs/architecture.md](docs/architecture.md) for how the pieces fit together.

## Getting Started

```bash
bun install
cp .env.example .env          # fill in the required values
bun run dev                   # the bot, in watch mode
```

The whole stack, in containers:

```bash
bun run docker:local -- up --build
bun run docker:local -- --profile dashboard up -d   # dashboard + its API
```

See [docs/development.md](docs/development.md).

## Configuration

Two layers, and the split is deliberate:

* **Infrastructure** — tokens, database URI, public URLs — lives in `.env`. See `.env.example` for
  every variable and which service reads it. In production the file lives at
  `/home/robtic/robtic-system/.env` and is edited by hand on the server; CI never writes it.
* **Everything operational** — prefixes, log channels, the server whitelist, feature toggles, XP,
  streak and quest settings — is stored in MongoDB and configured from Discord or the dashboard.

## Deployment

Images are built by GitHub Actions and published to GHCR, then run with Docker Compose on
`core.robtic.org`. Each service is content-addressed, so a push only rebuilds and redeploys what
actually changed. Configuration is not deployed — `.env` is maintained on the server by hand.

* [docs/deployment.md](docs/deployment.md) — the pipeline, per-service
* [infra/docker/README.md](infra/docker/README.md) — Dockerfiles, build contexts, Compose

## Purpose

Robtic System aims to provide a reliable automation backbone for developer-focused communities and
services.
