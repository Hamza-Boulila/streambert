# ── Stage 1: Build the React web frontend ─────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm install

# Copy application sources and build production web bundle
COPY index.html vite.config.js ./
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Production Web Application ───────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DOCKER_CONTAINER=true

# Install only production server dependencies
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy server code and built assets from builder
COPY server.js ./
COPY src/server/ ./src/server/
COPY --from=builder /app/dist ./dist

# Create storage / downloads folder
RUN mkdir -p /app/downloads && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
