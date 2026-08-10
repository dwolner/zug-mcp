FROM node:20-slim AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile --filter zug-web...

FROM base AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/web/node_modules ./web/node_modules
COPY . .
RUN pnpm --filter zug-web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/web/.next/standalone ./
COPY --from=build /repo/web/.next/static ./web/.next/static
COPY --from=build /repo/web/public ./web/public
EXPOSE 3000
CMD ["node", "web/server.js"]
