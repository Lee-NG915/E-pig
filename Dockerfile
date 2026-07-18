# syntax=docker/dockerfile:1

# E-pig 权威部署产物（docs/codex/research/04 §2）：Next standalone + multi-stage。
# 运行时注入 MARKET/COMMERCE_ADAPTER/LOG_LEVEL（见 .env.example），构建期不需要任何秘密。

FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期可使用默认 mock adapter；页面的 request-time boundaries 读取启动时 MARKET
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# 例：docker run -e MARKET=sg -e COMMERCE_ADAPTER=mock -p 3000:3000 e-pig
CMD ["node", "server.js"]
