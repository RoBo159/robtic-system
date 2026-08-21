#!/usr/bin/env bash
#
# Builds one service image, from anywhere in the repository.
#
#   infra/docker/scripts/build.sh dashboard-api
#   bun run docker:build dashboard-api
#
#   # extra flags are forwarded to `docker build`
#   infra/docker/scripts/build.sh minecraft-plugin --target jar --output type=local,dest=./target
#
# Exists because the Dockerfiles no longer sit next to what they build. Every one of them needs a
# `-f` and a context that is somewhere else, and the Minecraft plugin needs a *different* context
# from the other four — three facts that are easy to get wrong by hand and produce confusing
# failures when you do (`COPY package.json: not found` for the wrong context, or a build that
# silently ships the wrong tree). This is the one place that knows them.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
DOCKERFILES="infra/docker/dockerfiles"

service="${1:-}"
shift || true

usage() {
    echo "usage: infra/docker/scripts/build.sh <service> [docker build flags...]" >&2
    echo "  services: bot, platform-api, dashboard-api, dashboard, minecraft-plugin" >&2
}

if [ -z "$service" ]; then
    usage
    exit 2
fi

case "$service" in
    bot)           context="$ROOT"; image=robtic-system ;;
    platform-api)  context="$ROOT"; image=robtic-platform-api ;;
    dashboard-api) context="$ROOT"; image=robtic-dashboard-api ;;
    dashboard)     context="$ROOT"; image=robtic-dashboard ;;
    # Its own context, so the root .dockerignore — which excludes this directory from the bot image —
    # cannot hide the sources being compiled here.
    minecraft-plugin) context="$ROOT/apps/minecraft-plugin"; image=robtic-minecraft ;;
    *)
        echo "unknown service: $service" >&2
        usage
        exit 2
        ;;
esac

dockerfile="$ROOT/$DOCKERFILES/$service.Dockerfile"

if [ ! -f "$dockerfile" ]; then
    echo "no Dockerfile at $dockerfile" >&2
    exit 1
fi

relative="${context#"$ROOT"}"
relative="${relative#/}"
[ -n "$relative" ] || relative=". (repository root)"

echo "building $image"
echo "  dockerfile  $DOCKERFILES/$service.Dockerfile"
echo "  context     $relative"
echo ""

exec docker build -f "$dockerfile" -t "$image" "$@" "$context"
