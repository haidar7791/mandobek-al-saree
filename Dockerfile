# Cloud Run production image for the Express/Firebase backend.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY server ./server
COPY tsconfig.json ./
COPY app.json ./

RUN npm run server:build


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# ffmpeg is required by the existing server routes for video thumbnails.
RUN apk add --no-cache ffmpeg

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

COPY --from=builder /app/server_dist ./server_dist
COPY server/templates ./server/templates
COPY app.json ./
COPY privacy.html ./

EXPOSE 8080

CMD ["node", "server_dist/index.js"]
