# Robtic System

Robtic System is a modular Discord automation platform designed for developer communities.
One bot runs every system, with each system kept as a separate module in the codebase.

## Overview

The system is built to manage community operations, staff workflows, moderation, and service access in a structured and automated way.

## Core Components

* **Admin** – system controller, configuration manager, advertisement system, and partner server management
* **Moderation** – moderation tools, punishment logging, and the ticket system
* **HR** – staff management, recruitment, and promotions
* **ModMail** – private communication between users and staff
* **Community** – XP, activity tracking, and progression roles
* **Dev** – project sharing and review
* **Minecraft Plugin** – Paper plugin that makes a Minecraft server another client of the same economy

## Key Features

* Modular architecture — one client, one login, one command tree
* Database-managed server whitelist (`!addserver <serverid>`)
* Ticket and modmail systems
* Staff management automation
* Activity and role progression system
* Advertisement ordering and management
* Partner server tracking with automatic role re-grant on rejoin
* Structured moderation logging
* Minecraft integration — account linking, one shared coin balance, in-game ore exchange, chat bridge, server status, and Discord role → LuckPerms sync

## Technology

* Bun (workspaces monorepo)
* TypeScript
* Discord.js v14
* Environment-based configuration

## Repository Layout

```
apps/       Applications (bot and minecraft-plugin are live; activity, dashboard, api are scaffolds)
libs/       Shared libraries (core, database, types, sdk, ...)
docs/       All documentation
scripts/    Operational scripts (monitors)
```

See [docs/architecture.md](docs/architecture.md) and [docs/development.md](docs/development.md).

## Configuration

The bot token and infrastructure settings live in `.env` (see `.env.example`). Everything
operational — prefixes, log channels, the server whitelist, XP and streak settings — is stored in
MongoDB and configured from Discord.

## Purpose

Robtic System aims to provide a reliable automation backbone for developer-focused communities and services.
