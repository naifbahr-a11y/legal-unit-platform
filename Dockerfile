# ============================
# Stage 1: Build
# ============================
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm (match packageManager version)
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Copy dependency files + patches (required for frozen lockfile)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend + backend
RUN pnpm build

# ============================
# Stage 2: Production
# ============================
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/dist ./dist

# Copy drizzle migrations + migration runner
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/apply-pending-migrations.mjs ./scripts/apply-pending-migrations.mjs
COPY --from=builder /app/scripts/seed-admin.mjs ./scripts/seed-admin.mjs
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x scripts/docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
