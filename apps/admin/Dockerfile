# syntax=docker/dockerfile:1
FROM node:26.8-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/types/package.json packages/types/package.json
COPY apps/admin/package.json apps/admin/package.json
RUN pnpm install --frozen-lockfile --filter @embr/admin...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/admin ./apps/admin
RUN pnpm --filter @embr/types build && pnpm --filter @embr/admin build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/admin
COPY --from=build /repo/apps/admin/.next/standalone ./
COPY --from=build /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build /repo/apps/admin/public ./apps/admin/public

USER node
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
