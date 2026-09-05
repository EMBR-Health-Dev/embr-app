# syntax=docker/dockerfile:1
FROM node:22.22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/types/package.json packages/types/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY apps/admin/package.json apps/admin/package.json
RUN pnpm install --frozen-lockfile --filter @embr/admin...

FROM deps AS build
# The /api/* same-origin proxy target is evaluated by next.config.ts at
# BUILD time and baked into the standalone output (required-server-files
# json) — a runtime API_URL cannot change it. Default to the compose
# service name; other deployments override via --build-arg.
ARG API_URL=http://api:4000
ENV API_URL=${API_URL}
COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/validation ./packages/validation
COPY apps/admin ./apps/admin
RUN pnpm --filter @embr/types build && \
    pnpm --filter @embr/validation build && \
    pnpm --filter @embr/admin build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/admin
COPY --from=build /repo/apps/admin/.next/standalone ./
COPY --from=build /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build /repo/apps/admin/public ./apps/admin/public

USER node
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
