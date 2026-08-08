# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install all dependencies (including devDeps needed for esbuild)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source files needed for the server build
COPY server/ ./server/
COPY tsconfig*.json ./
COPY app.json ./

# Build the server bundle
# --packages=external keeps node_modules at runtime (no bundling of npm packages)
RUN npm run server:build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled server bundle
COPY --from=builder /app/server_dist/ ./server_dist/

# Copy runtime assets the server reads from disk
COPY server/templates/ ./server/templates/
COPY app.json ./
COPY privacy.html ./privacy.html

# Cloud Run injects PORT env var; Express reads process.env.PORT || 5000
# Expose 8080 as the Cloud Run default
EXPOSE 8080

CMD ["node", "server_dist/index.js"]
