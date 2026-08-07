# Robtic System

Robtic System is a modular Discord automation platform designed for developer communities.
It provides a scalable bot ecosystem where multiple specialized bots operate under a single main controller.

## Overview

The system is built to manage community operations, staff workflows, moderation, and service access in a structured and automated way.

A central **Main Bot** controls and coordinates several functional bots, allowing administrators to enable or disable modules as needed.

## Core Components

* **Main Bot** – system controller, configuration manager, advertisement system, and partner server management
* **Moderation Bot** – moderation tools, punishment logging, and the ticket system
* **HR Bot** – staff management, recruitment, and promotions
* **ModMail Bot** – private communication between users and staff
* **Community Bot** – XP, activity tracking, and progression roles
* **Dev Bot** – development and testing
* **Minecraft Plugin** – Paper plugin that makes a Minecraft server another client of the same economy

## Key Features

* Modular bot architecture
* Centralized system control
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

All bot tokens and system configuration are defined in the `.env` file.

## Purpose

Robtic System aims to provide a reliable automation backbone for developer-focused communities and services.
