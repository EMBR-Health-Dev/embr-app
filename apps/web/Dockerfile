# syntax=docker/dockerfile:1
FROM node:22.22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/types/package.json packages/types/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @embr/web...

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
COPY apps/web ./apps/web
RUN pnpm --filter @embr/types build && \
    pnpm --filter @embr/validation build && \
    pnpm --filter @embr/web build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/web
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
