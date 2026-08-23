# Context: repository root.  docker build -f infra/docker/dockerfiles/dashboard.Dockerfile .
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


FROM oven/bun:1.3.14 AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/dashboard ./apps/dashboard

# Bun does not hoist workspace deps to the root. After the source copy: COPY merges directories.
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules

# No build args: the API URL is read at request time, so this image is environment-independent.
ENV NEXT_TELEMETRY_DISABLED=1
# Opts into output: "standalone" — see next.config.mjs.
ENV NEXT_OUTPUT_STANDALONE=true

WORKDIR /app/apps/dashboard
RUN bun run build


FROM oven/bun:1.3.14
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The standalone bundle carries its own traced node_modules; nothing is installed here.
COPY --from=build /app/apps/dashboard/.next/standalone ./

# Static assets are data, not imports, so Next expects them placed by hand.
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

EXPOSE 3000

# Not `bun run start`: the standalone output is its own server.
CMD ["bun", "apps/dashboard/server.js"]
