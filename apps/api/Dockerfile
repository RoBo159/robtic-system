FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/bot/package.json ./apps/bot/
COPY apps/activity/package.json ./apps/activity/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/api/package.json ./apps/api/
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
COPY apps/api ./apps/api
COPY libs ./libs

# --preload stubs node:v8 for BSON/mongoose on Bun (same shim the bot uses). The api now
# touches the database (profile / leaderboard / admin config), so without this it crash-loops.
CMD ["bun", "--preload", "./libs/shared/src/preload.ts", "apps/api/src/index.ts"]
