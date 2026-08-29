#!/usr/bin/env bash
#
# Verifies the building marker system without a server.
#
#   RegionCheck      two corner markers in any order give the same box; volume does not overflow.
#   ValidationCheck  every rule fires — missing origin, duplicate seller, marker outside the
#                    structure, unknown type, bad metadata — and the level gate works.
#   ConfigCheck      markers.yml loads, every marker names a declared category, exactly one type
#                    claims each corner, and no two types claim the same NPC role.
#
# Runs in Docker: no local Maven or JDK required.
set -euo pipefail

cd "$(dirname "$0")/.."

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd)":/app \
  -v "${HOME}/.m2":/root/.m2 \
  -w /app \
  maven:3.9-eclipse-temurin-21 \
  sh -c 'mvn -q -B -o -pl robtic-core,robtic-world -am install -DskipTests && \
         mvn -o -q -pl robtic-world dependency:build-classpath -Dmdep.outputFile=/tmp/cp.txt >/dev/null 2>&1 && \
         CP="robtic-world/target/classes:robtic-world/target/test-classes:robtic-core/target/classes:$(cat /tmp/cp.txt)" && \
         java -cp "$CP" org.robtic.world.RegionCheck && \
         java -cp "$CP" org.robtic.world.ValidationCheck && \
         java -cp "$CP" org.robtic.world.ConfigCheck robtic-world/src/main/resources/markers.yml'
