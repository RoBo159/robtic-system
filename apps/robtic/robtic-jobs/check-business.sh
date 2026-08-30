#!/usr/bin/env bash
#
# Verifies the whole business management system without a server.
#
# The business system spans three plugins and seven configuration files, and nearly every way it can
# be misconfigured is SILENT at runtime — which is why this exists as a command rather than as a
# startup warning nobody reads.
#
# What a failure here would otherwise look like on a live server:
#
#   base levels        a gap in the ladder means nothing can upgrade past the hole, and the button
#                      is simply there and does nothing
#   worker limits      a limit that falls as the business grows means an upgrade fires staff, and
#                      the system has no answer for which of them to dismiss
#   upgrades           a step requiring a base level the ladder never reaches is a menu entry that
#                      is greyed out forever, indistinguishable from a deliberate gate
#   dependencies       an upgrade depending on one that is not defined can never be bought
#   licences           workspace.yml naming a licence licenses.yml does not define means the gate
#                      silently never passes — or, for the operating licence, that every business
#                      on the server is judged against a licence nobody can hold
#   warnings           thresholds out of order fire the wrong warning, so a player is told they
#                      have three days left when they have one
#   yield tables       a profession renamed out from under its table means those workers draw
#                      wages and produce nothing, forever
#   NPCs               a role or worker definition of the wrong kind puts a figure in the world
#                      that ignores every click
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
