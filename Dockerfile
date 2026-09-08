# Cloud Run production image for the Express/Firebase backend.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY server ./server
COPY tsconfig.json ./
COPY app.json ./

# بناء ملفات TypeScript
RUN npm run server:build


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# ffmpeg is required by the existing server routes for video thumbnails.
RUN apk add --no-cache ffmpeg

# نسخ الملفات المطلوبة للتشغيل بشكل صحيح ومباشر في مجلد العمل الحالي
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY app.json ./
COPY privacy.html ./

EXPOSE 8080

CMD ["node", "server/index.js"]
