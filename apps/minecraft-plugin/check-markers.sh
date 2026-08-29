#!/usr/bin/env bash
#
# Verifies the building marker system without a server.
#
# Three things that cannot be found by running the plugin, because every one of them fails silently:
#
#   RegionCheck      that two corner markers placed in any order give the same box. Get this wrong
#                    and protection works in some buildings and not others, with nothing in any log.
#   ValidationCheck  that every rule the system promises actually fires — missing origin, duplicate
#                    seller, marker outside the structure, unknown type, bad metadata. A missing
#                    check means a broken building generates, looks normal, and does nothing.
#   ConfigCheck      that the shipped markers.yml loads, that every marker names a declared category,
#                    that exactly one type claims each corner, and that no two types claim the same
#                    NPC role.
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
         CP="target/classes:target/test-classes:src/main/resources:$(cat /tmp/cp.txt)" && \
         java -cp "$CP" org.robtic.minecraft.structure.RegionCheck && \
         java -cp "$CP" org.robtic.minecraft.structure.ValidationCheck && \
         java -cp "$CP" org.robtic.minecraft.structure.ConfigCheck src/main/resources/markers.yml'
