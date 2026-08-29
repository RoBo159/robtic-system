#!/usr/bin/env bash
#
# Verifies the progression configuration without a server.
#
# ProgressionConfigCheck loads jobs.yml, npc.yml and workspace.yml and cross-checks them: that every
# job's milestone titles exist, that every workspace tier names an NPC role that is defined, and that
# nothing references a job, title or NPC that was renamed out from under it.
#
# titles.yml lives in RobticCore now — titles are Core infrastructure — so it is read from there.
#
# Runs in Docker: no local Maven or JDK required.
set -euo pipefail

cd "$(dirname "$0")/.."

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd)":/app \
  -v "${HOME}/.m2":/root/.m2 \
  -w /app \
  maven:3.9-eclipse-temurin-21 \
  sh -c 'mvn -q -B -o -pl robtic-core,robtic-world,robtic-jobs -am install -DskipTests && \
         mvn -q -B -o -pl robtic-jobs test-compile && \
         mvn -o -q -pl robtic-jobs dependency:build-classpath -Dmdep.outputFile=/tmp/cp.txt >/dev/null 2>&1 && \
         CP="robtic-jobs/target/classes:robtic-jobs/target/test-classes:robtic-jobs/src/main/resources:robtic-core/target/classes:robtic-core/src/main/resources:$(cat /tmp/cp.txt)" && \
         java -cp "$CP" org.robtic.jobs.ProgressionConfigCheck'
