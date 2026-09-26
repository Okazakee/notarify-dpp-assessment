# syntax=docker/dockerfile:1
#
# The API image.
#
# Four stages, because the API has three genuinely different needs:
#   deps     workspace manifests and the lockfile only, so dependency installation is cached
#   builder  full source, the generated Prisma client and the compiled API. It also carries
#            the Prisma CLI, so the one-shot migration and seed services reuse this stage.
#   runner   production runtime only: compiled output plus installed dependencies.
#
# Debian slim rather than Alpine on purpose. The application depends on prebuilt native
# modules (`sharp`, `@node-rs/argon2`) whose glibc builds are the supported ones; musl would
# add real risk for a small size win.

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
# deps — manifests first, so this layer only invalidates when dependencies change
# ---------------------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------------------
# builder — source, Prisma client generation and the compiled API
# ---------------------------------------------------------------------------------------
FROM deps AS builder
COPY . .
# The API build runs `prisma generate` and then `tsc`, so the compiled tree already contains
# the generated client at dist/src/generated.
#
# `prisma7.config.ts` resolves DATABASE_URL eagerly so the CLI fails fast on a real command
# rather than later with an opaque connection error. Client generation neither connects nor
# migrates, so the build supplies a placeholder for that single command instead of baking a
# fake URL into the image: the migration and seed services receive the real URL from Compose.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public \
    pnpm --filter @notarify/api build

# ---------------------------------------------------------------------------------------
# runner — the API process only
# ---------------------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# The pnpm layout is preserved (workspace links plus the virtual store behind them), because
# copying only the leaf folders would break the symlinks between them.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json ./package.json

# Run as the unprivileged user the base image already provides.
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/src/main.js"]
