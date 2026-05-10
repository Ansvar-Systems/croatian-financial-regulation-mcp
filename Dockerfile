# Croatian Financial Regulation MCP — multi-stage Dockerfile
# Build:  docker build -t croatian-financial-regulation-mcp .
# Run:    docker run --rm -p 3000:3000 croatian-financial-regulation-mcp
#
# The image expects a pre-built database at /app/data/hanfa.db.
# Override with HANFA_DB_PATH for a custom location.
#
# Multi-stage build:
#   - builder stage runs npm ci WITHOUT --ignore-scripts so better-sqlite3
#     postinstall builds the native binding
#   - production stage COPIES node_modules from builder (binding intact)
#     instead of running a second npm ci that would strip it

# Stage 1: Build TypeScript and native modules
FROM node:20-slim AS builder

WORKDIR /app

# Install build toolchain for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
# Run full install WITH scripts so better-sqlite3 postinstall builds .node binding
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# Prune dev deps but keep the built native binding
RUN npm prune --omit=dev

# Stage 2: Production
FROM node:20-slim AS production

WORKDIR /app
ENV NODE_ENV=production
ENV HANFA_DB_PATH=/app/data/hanfa.db

# Copy built artefacts and pruned node_modules (with native binding) from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Database — provisioned by ghcr-build.yml at CI time from the GitHub Release
# asset (see workflow's "Provision database" step). Source path data/database.db
# is the workflow's gunzip target; destination is the runtime DB filename.
COPY data/database.db data/hanfa.db

# Non-root user for security
RUN addgroup --system --gid 1001 mcp && \
    adduser --system --uid 1001 --ingroup mcp mcp && \
    chown -R mcp:mcp /app
USER mcp

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/src/http-server.js"]
