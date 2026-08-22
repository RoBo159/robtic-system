# Context: apps/minecraft-plugin, not the repo root (the root .dockerignore excludes it).
# Jar only: bun run docker:build minecraft-plugin --target jar --output type=local,dest=./target

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Dependencies resolve into a cached layer so an edit to a source file doesn't re-download Paper.
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package

# Extract-only stage: writes the jar to the host without building the server image.
FROM scratch AS jar
COPY --from=build /build/target/RobticMinecraft-*.jar /


FROM itzg/minecraft-server:java21 AS server

# Paper, matching the api-version the plugin declares.
ENV TYPE=PAPER \
    VERSION=1.21.4 \
    MEMORY=2G \
    ONLINE_MODE=FALSE \
    ENABLE_AUTOPAUSE=FALSE

# The base image copies /plugins into /data/plugins on start.
COPY --from=build /build/target/RobticMinecraft-*.jar /plugins/RobticMinecraft.jar
