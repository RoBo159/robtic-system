FROM oven/bun:1.3.14 AS build
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

COPY libs ./libs
COPY apps/activity ./apps/activity

# Vite inlines VITE_* values at build time, so the client id must be a build arg.
ARG VITE_DISCORD_CLIENT_ID
ENV VITE_DISCORD_CLIENT_ID=${VITE_DISCORD_CLIENT_ID}

RUN cd apps/activity && bun run build

FROM nginx:1.27-alpine

COPY apps/activity/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/activity/dist /usr/share/nginx/html
