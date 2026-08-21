# The one Dockerfile here whose context is *not* the repo root: it is apps/minecraft-plugin. The root
# .dockerignore excludes that directory from the bot image, so building it from the root context
# would hide the very sources this compiles. Its own .dockerignore stays in apps/minecraft-plugin
# for the same reason — a .dockerignore is only read from the context root.
#
#   Compile only:  docker build -f infra/docker/dockerfiles/minecraft-plugin.Dockerfile \
#                    --target jar --output type=local,dest=./target apps/minecraft-plugin
#   Test server:   bun run docker:local -- up minecraft

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Dependencies resolve into a cached layer so an edit to a source file doesn't re-download Paper.
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package

# Extract-only stage: `--target jar --output type=local` writes the jar to the host without
# building the server image.
FROM scratch AS jar
COPY --from=build /build/target/RobticMinecraft-*.jar /


FROM itzg/minecraft-server:java21 AS server

# Paper, matching the api-version the plugin declares.
ENV TYPE=PAPER \
    VERSION=1.21.4 \
    MEMORY=2G \
    ONLINE_MODE=FALSE \
    ENABLE_AUTOPAUSE=FALSE

# /plugins is copied into /data/plugins on start by the base image, which keeps the mounted
# world volume free of a stale jar from a previous build.
COPY --from=build /build/target/RobticMinecraft-*.jar /plugins/RobticMinecraft.jar
