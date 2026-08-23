#!/usr/bin/env bash
# Builds one service image from anywhere in the repo: bun run docker:build <service> [flags]
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
DOCKERFILES="infra/docker/dockerfiles"

service="${1:-}"
shift || true

usage() {
    echo "usage: bun run docker:build <service> [docker build flags...]" >&2
    echo "  services: bot, minecraft-api, dashboard-api, dashboard, minecraft-plugin" >&2
}

if [ -z "$service" ]; then
    usage
    exit 2
fi

case "$service" in
    bot)           context="$ROOT"; image=robtic-system ;;
    minecraft-api) context="$ROOT"; image=robtic-minecraft-api ;;
    dashboard-api) context="$ROOT"; image=robtic-dashboard-api ;;
    dashboard)     context="$ROOT"; image=robtic-dashboard ;;
    # Its own context: the root .dockerignore excludes this directory.
    minecraft-plugin) context="$ROOT/apps/minecraft-plugin"; image=robtic-minecraft ;;
    *)
        echo "error: unknown service: $service" >&2
        usage
        exit 2
        ;;
esac

dockerfile="$ROOT/$DOCKERFILES/$service.Dockerfile"

if [ ! -f "$dockerfile" ]; then
    echo "error: no Dockerfile at $dockerfile" >&2
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
