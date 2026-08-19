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
COPY apps/dashboard-api ./apps/dashboard-api
COPY libs ./libs

EXPOSE 3003

# WORKDIR is the app, not /app. Bun reads `experimentalDecorators` from the nearest tsconfig to the
# working directory, and the root one does not set it — started from /app, every `@Controller`
# throws at import time because Bun applies TC39 decorators instead of the legacy ones Nest needs.
WORKDIR /app/apps/dashboard-api

# --preload stubs node:v8 for BSON/mongoose on Bun, the same shim the bot and the platform API use.
# This service reads the database directly, so without it nothing starts at all.
CMD ["bun", "--preload", "../../libs/shared/src/preload.ts", "src/main.ts"]
