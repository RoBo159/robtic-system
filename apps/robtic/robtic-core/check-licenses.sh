#!/usr/bin/env bash
#
# Verifies the licence system's logic without a server.
#
#   SigCheck     that a forged licence item is actually rejected. This is security code — the whole
#                system's guarantee is that renaming an item or editing its NBT does not produce a
#                valid licence, and that guarantee is worth a test rather than a comment.
#   LogicCheck   that expiry and renewal arithmetic is right. Renewing early must not lose the time
#                already paid for, and renewing a long-lapsed licence must not leave it lapsed.
#   ConfigCheck  that the shipped licenses.yml loads, and that every category and statistic it
#                references actually exists. A licence naming a missing statistic records nothing,
#                silently, forever.
#
# Runs in Docker: no local Maven or JDK required.
set -euo pipefail

cd "$(dirname "$0")/.."

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd)":/app \
  -v "${HOME}/.m2":/root/.m2 \
  -w /app \
  maven:3.9-eclipse-temurin-21 \
  sh -c 'mvn -q -B -o -pl robtic-core test-compile && \
         mvn -o -q -pl robtic-core dependency:build-classpath -Dmdep.outputFile=/tmp/cp.txt >/dev/null 2>&1 && \
         CP="robtic-core/target/classes:robtic-core/target/test-classes:robtic-core/src/main/resources:$(cat /tmp/cp.txt)" && \
         java -cp "$CP" org.robtic.core.license.SigCheck && \
         java -cp "$CP" org.robtic.core.license.LogicCheck && \
         java -cp "$CP" org.robtic.core.license.ConfigCheck \
              robtic-core/src/main/resources/licenses.yml robtic-core/src/main/resources/statistics.yml'
