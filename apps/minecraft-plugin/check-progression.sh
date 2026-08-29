#!/usr/bin/env bash
# Validates the progression config files against each other and against the code.
#
# The runtime parsers are deliberately forgiving — a job naming a missing NPC warns and carries on,
# because refusing to load would take a whole profession off the server over one typo. That is right
# in production and useless as a safety net, so the cross-file references are checked here instead,
# where a mistake fails immediately.
#
# Runs in Docker for the same reason the build does: no local Maven or JDK required.
set -euo pipefail

cd "$(dirname "$0")"

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd)":/app \
  -v "${HOME}/.m2":/root/.m2 \
  -w /app \
  maven:3.9-eclipse-temurin-21 \
  sh -c 'mvn -q -B -o test-compile && \
         mvn -o -q dependency:build-classpath -Dmdep.outputFile=/tmp/cp.txt >/dev/null 2>&1 && \
         java -cp target/classes:target/test-classes:src/main/resources:$(cat /tmp/cp.txt) \
              org.robtic.minecraft.progression.ProgressionConfigCheck'
