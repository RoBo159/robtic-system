# Context: repository root.  docker build -f infra/docker/dockerfiles/dashboard-api.Dockerfile .
FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/bot/package.json ./apps/bot/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/dashboard-api/package.json ./apps/dashboard-api/
COPY apps/minecraft-api/package.json ./apps/minecraft-api/
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
COPY apps/dashboard-api ./apps/dashboard-api

# Bun does not hoist workspace deps to the root. After the source copy: COPY merges directories.
COPY --from=deps /app/apps/dashboard-api/node_modules ./apps/dashboard-api/node_modules
COPY libs ./libs

EXPOSE 3003

# WORKDIR is the app: Bun reads experimentalDecorators from the nearest tsconfig.
WORKDIR /app/apps/dashboard-api

# --preload stubs node:v8 for BSON/mongoose on Bun.
CMD ["bun", "--preload", "../../libs/shared/src/preload.ts", "src/main.ts"]
