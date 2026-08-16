#!/usr/bin/env bash
#
# Prints the build signature of one service: a hash of every tracked file that can change its
# image. The deploy workflow uses it as a cache key — an already-cached signature means this exact
# content was built and deployed before, so the service is skipped.
#
#   scripts/deploy-signature.sh bot
#   EXTRA_SIGNATURE_INPUT="$SOME_BUILD_ARG" scripts/deploy-signature.sh activity
#
# Content, not history: two different commits with identical file contents produce the same
# signature, so a revert or a rebase re-uses what was already deployed instead of rebuilding it.
set -euo pipefail

service="${1:-}"
if [ -z "$service" ]; then
    echo "usage: scripts/deploy-signature.sh <bot|api|platform-api|activity>" >&2
    exit 2
fi

# Everything the dependency stage of every Dockerfile copies before `bun install`, plus the
# workflow itself — changing an image name or a compose command has to redeploy, even when no
# source file moved.
common=(
    package.json
    bun.lock
    tsconfig.json
    .dockerignore
    .github/workflows/deploy.yml
    scripts/deploy-signature.sh
    apps/*/package.json
    libs/*/package.json
)

# One entry per service, matching what its Dockerfile actually copies into the image.
case "$service" in
    bot)
        paths=("${common[@]}" Dockerfile apps/bot libs images)
        ;;
    api)
        paths=("${common[@]}" apps/api libs)
        ;;
    platform-api)
        paths=("${common[@]}" apps/robtic-api libs)
        ;;
    activity)
        # Not all of `libs`: the Activity's only workspace dependency is @robtic/sdk, and Vite
        # bundles what is imported. A change to libs/core cannot alter the static bundle, so
        # including it here would rebuild the Activity for every bot-side change.
        paths=("${common[@]}" apps/activity libs/sdk)
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
mapfile -t files < <(git ls-files -- "${paths[@]}" | LC_ALL=C sort)

{
    printf '%s\n' "${files[@]}" | git hash-object --stdin-paths
    printf '%s\n' "${files[@]}"
    # Build args are part of the image but not of the tree — the Activity inlines a client id.
    printf 'extra:%s\n' "${EXTRA_SIGNATURE_INPUT:-}"
} | sha256sum | cut -d' ' -f1
