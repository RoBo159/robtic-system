#!/usr/bin/env bash
#
# Prints the build signature of one service: a hash of every tracked file that can change its
# image. The deploy workflow uses it as a cache key — an already-cached signature means this exact
# content was built and deployed before, so the service is skipped.
#
#   scripts/deploy-signature.sh bot
#   EXTRA_SIGNATURE_INPUT="$SOME_BUILD_ARG" scripts/deploy-signature.sh dashboard
#
# Content, not history: two different commits with identical file contents produce the same
# signature, so a revert or a rebase re-uses what was already deployed instead of rebuilding it.
set -euo pipefail

service="${1:-}"
if [ -z "$service" ]; then
    echo "usage: scripts/deploy-signature.sh <bot|dashboard-api|dashboard>" >&2
    exit 2
fi

# Everything the dependency stage of every Dockerfile copies before `bun install`, plus the deploy
# workflows and the action they share — changing an image name or a compose command has to
# redeploy, even when no source file moved. The glob is deliberate: a workflow added for a third
# service is picked up without anyone remembering to edit this list.
common=(
    package.json
    bun.lock
    tsconfig.json
    .dockerignore
    .github/workflows/deploy-*.yml
    .github/actions/deploy-decision/action.yml
    scripts/deploy-signature.sh
    apps/*/package.json
    libs/*/package.json
    # The production topology. Not previously signed, which was a gap: editing a port mapping or a
    # healthcheck changed what runs on the server while every signature stayed the same, so the
    # deploy that would have applied it was skipped as "unchanged". The local stack is deliberately
    # absent — it never runs on the server.
    infra/docker/compose/docker-compose.yml
)

# One entry per service, matching what its Dockerfile actually copies into the image.
#
# Each names its own Dockerfile under infra/docker/ explicitly. They used to be picked up implicitly,
# by sitting inside the app directory already being hashed — moving them to infra/ ended that, and an
# unlisted Dockerfile is the worst kind of miss here: editing it would leave the signature unchanged,
# so the deploy would be skipped as "already deployed" and the edit would never ship.
case "$service" in
    bot)
        paths=("${common[@]}" infra/docker/dockerfiles/bot.Dockerfile apps/bot libs images)
        ;;
    dashboard-api)
        paths=("${common[@]}" infra/docker/dockerfiles/dashboard-api.Dockerfile apps/dashboard-api libs)
        ;;
    # No `libs`: the dashboard imports nothing from them — it is a client of dashboard-api and
    # nothing else. Including them would rebuild the web image on every repository change.
    dashboard)
        paths=("${common[@]}" infra/docker/dockerfiles/dashboard.Dockerfile apps/dashboard)
        ;;
    *)
        echo "unknown service: $service" >&2
        exit 2
        ;;
esac

# `git ls-files` selects the tracked files, `git hash-object --stdin-paths` hashes each one. Three
# properties come out of that pairing, and all three are load-bearing:
#
#   - **Tracked only.** Untracked and ignored files are invisible here exactly as they are to the
#     Docker build after .dockerignore.
#   - **Working tree, not the index.** `ls-files -s` would print the *staged* blob hash, so an
#     unstaged edit would read as "nothing changed" — the one direction this must never fail in.
#   - **Normalised.** hash-object applies the same filters as a commit, so a CRLF checkout on
#     Windows produces the same signature as an LF checkout on the runner. Hashing raw bytes off
#     disk does not, and every signature would shift the first time a machine with different line
#     endings ran this.
#
# Paths are hashed alongside the contents, so moving a file changes the signature even when nothing
# was edited. Both lists come out in the same sorted order, so the pairing is stable.
#
# Filtered to files that exist on disk. `git ls-files` reports what is tracked, which still includes
# a file deleted in the working tree but not yet committed — hash-object then fails on it and takes
# the whole script with it under `set -e`. On a CI checkout every tracked file exists, so this
# changes no signature there; it only stops a local run dying mid-edit.
mapfile -t files < <(git ls-files -- "${paths[@]}" | LC_ALL=C sort | while IFS= read -r f; do
    [ -e "$f" ] && printf '%s\n' "$f"
done)

{
    printf '%s\n' "${files[@]}" | git hash-object --stdin-paths
    printf '%s\n' "${files[@]}"
    # Build args are part of an image but not of the tree, so they are hashed in explicitly.
    printf 'extra:%s\n' "${EXTRA_SIGNATURE_INPUT:-}"
} | sha256sum | cut -d' ' -f1
