# ──── Build Stage ────
FROM node:24-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./
COPY apps/server/package.json apps/server/

RUN pnpm install --frozen-lockfile --filter @ecom/server

COPY apps/server apps/server/
RUN pnpm --filter @ecom/server build

# ──── Production Stage ────
FROM node:24-alpine

RUN npm install -g pnpm@9

WORKDIR /app
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "--filter", "@ecom/server", "start:prod"]
