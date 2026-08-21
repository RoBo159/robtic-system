# Build context: the repository root, not this directory.
#
#   docker build -f infra/docker/dockerfiles/platform-api.Dockerfile -t robtic-platform-api .
#
# Every COPY below is therefore repo-relative, and the root .dockerignore is what prunes the context.
FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/bot/package.json ./apps/bot/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/dashboard-api/package.json ./apps/dashboard-api/
COPY apps/robtic-api/package.json ./apps/robtic-api/
COPY libs/core/package.json ./libs/core/
COPY libs/database/package.json ./libs/database/
COPY libs/types/package.json ./libs/types/
COPY libs/sdk/package.json ./libs/sdk/
COPY libs/config/package.json ./libs/config/
COPY libs/constants/package.json ./libs/constants/
COPY libs/utils/package.json ./libs/utils/
COPY libs/logger/package.json ./libs/logger/
COPY libs/cache/package.json ./libs/cache/
COPY libs/events/package.json ./libs/events/
COPY libs/shared/package.json ./libs/shared/
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY apps/robtic-api ./apps/robtic-api

# Bun keeps a workspace's own dependencies in that workspace's node_modules rather than hoisting
# them to the root. Today this is only the `@robtic/sdk` link, and nothing imports it by package
# name — the code reaches libs/sdk through the `@sdk` tsconfig alias — so the image worked without
# it. It is here so that stops being a thing anyone has to know: the first `import "@robtic/sdk"`
# would otherwise fail at container start, long after the build went green.
COPY --from=deps /app/apps/robtic-api/node_modules ./apps/robtic-api/node_modules
COPY libs ./libs

EXPOSE 3002

# --preload stubs node:v8 for BSON/mongoose on Bun, the same shim the bot and api use. This
# service owns the database outright, so without it nothing starts at all.
CMD ["bun", "--preload", "./libs/shared/src/preload.ts", "apps/robtic-api/src/index.ts"]
