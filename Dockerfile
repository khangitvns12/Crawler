# ─── Stage 1: install dependencies ───────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# Install only production deps first for better layer caching
COPY package.json ./
# bun.lock exists in repo; use npm install so we don't need bun in CI
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# ─── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next.config.ts already sets output: 'standalone' – no extra env needed
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─── Stage 3: production runner ───────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Port Railway will route to (overridable via Railway env)
ENV PORT=3000

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public 2>/dev/null || true

# Persistent data directory for background jobs & local DB cache
RUN mkdir -p /app/.data && chown -R nextjs:nodejs /app/.data
VOLUME ["/app/.data"]

USER nextjs

EXPOSE 3000

# Start the Next.js standalone server
CMD ["node", "server.js"]
