#!/usr/bin/env bash
#
# Builds the plugin in Docker, so nothing has to be installed on the host.
#
# Gradle itself, the JDK and the Paper API all live inside the container. The only requirement is a
# running Docker daemon — which is also what makes this build identical on a developer's machine and
# in CI, rather than depending on whichever JDK happens to be on PATH.
#
# The Gradle cache is a named volume rather than a bind mount: dependencies survive between runs
# (the first build downloads Paper's API, later ones do not), and nothing is written into the
# project directory as root.
#
#   ./build.sh              assemble the jar
#   ./build.sh clean build  anything else you would pass gradle
#
set -euo pipefail

# Git Bash on Windows rewrites anything that looks like a Unix path in a command line, so the
# container's `-w /app` arrives as `C:/Program Files/Git/app` and Docker refuses it. Switching this
# off is the documented escape hatch, and it is harmless everywhere else.
export MSYS_NO_PATHCONV=1

IMAGE="gradle:8.10-jdk21"
CACHE_VOLUME="dragonbattle-gradle-cache"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker run --rm \
    -v "${PROJECT_DIR}:/app" \
    -w /app \
    -v "${CACHE_VOLUME}:/home/gradle/.gradle" \
    "${IMAGE}" \
    gradle --no-daemon "${@:-build}"

echo
echo "Jar:"
ls -lh "${PROJECT_DIR}/build/libs/" 2>/dev/null || echo "  (none — the build produced no jar)"
