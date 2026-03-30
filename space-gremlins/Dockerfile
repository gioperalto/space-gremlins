# ─── Stage 1: Build client ───────────────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /app

# Install client deps
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy client source and build
# vite.config.js outDir is '../server/dist' — relative to /app/client = /app/server/dist
# So we need the server/dist directory to exist
RUN mkdir -p server/dist

COPY client/ ./client/
RUN cd client && npm run build
# Built assets now at /app/server/dist/

# ─── Stage 2: Production server ──────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./
# Copy built client from stage 1
COPY --from=client-builder /app/server/dist ./dist

# Railway sets PORT automatically
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
