# syntax=docker/dockerfile:1
#
# The web image.
#
# Same four-stage shape as the API image, with one extra build input: `NEXT_PUBLIC_*` values
# are inlined into the browser bundle at build time, so the browser-visible API origin has to
# be supplied during `next build`. The server-side internal origin (`INTERNAL_API_URL`) is a
# runtime value and is passed by Compose instead.

# ---------------------------------------------------------------------------------------
# base
# ---------------------------------------------------------------------------------------
FROM node:24.21.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /app

# ---------------------------------------------------------------------------------------
# deps
# ---------------------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------------------
# builder
# ---------------------------------------------------------------------------------------
FROM deps AS builder
COPY . .
# The reviewer default is the API published on the host at :3000. Compose passes this
# explicitly so the browser bundle and the published port cannot drift apart.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm --filter @notarify/web build

# ---------------------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
# `next start` reads the config at runtime, and this one owns the /q/:uuid rewrite.
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/package.json ./package.json

USER node
EXPOSE 3001
CMD ["pnpm", "--filter", "@notarify/web", "start", "--", "-p", "3001"]
