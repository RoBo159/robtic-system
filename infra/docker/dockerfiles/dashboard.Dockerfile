# Build context: the repository root, not this directory.
#
#   docker build -f infra/docker/dockerfiles/dashboard.Dockerfile -t robtic-dashboard .
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


FROM oven/bun:1.3.14 AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/dashboard ./apps/dashboard

# Bun keeps a workspace's own dependencies in that workspace's node_modules rather than hoisting
# them to the root — `@nestjs/*`, `next` and friends are simply not in /app/node_modules, and the
# `.bin` entries that make `bun run build` work live here too. Copying only the root tree gets a
# `next: command not found` at build time, or a missing @nestjs/common at container start.
#
# After the source copy, not before: COPY merges directories, and the build context has no
# node_modules of its own (.dockerignore), so this order is what survives.
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules

# No build arguments, deliberately. Where the browser reaches the API is read at request time from
# DASHBOARD_PUBLIC_API_URL (see src/lib/api-config.tsx), so this image is environment-independent —
# the same digest runs in staging and production, and a wrong URL is a restart rather than a rebuild.
ENV NEXT_TELEMETRY_DISABLED=1
# Opts into `output: "standalone"` — see the comment in next.config.mjs for why it is not the default.
ENV NEXT_OUTPUT_STANDALONE=true

WORKDIR /app/apps/dashboard
RUN bun run build


FROM oven/bun:1.3.14
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The standalone bundle carries its own traced node_modules, so nothing is installed here. Its
# layout is nested because outputFileTracingRoot is the monorepo root: the server lands under
# `apps/dashboard/` and the shared dependencies beside it at the top.
COPY --from=build /app/apps/dashboard/.next/standalone ./

# Neither of these is traced — static assets and the public directory are data, not imports, so
# Next expects them to be placed next to the server by hand.
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

EXPOSE 3000

# Not `bun run start`: the standalone output is its own server, and `next start` would need the
# full Next CLI and the untraced node_modules this image deliberately does not have.
CMD ["bun", "apps/dashboard/server.js"]
