FROM node:22-alpine AS builder

WORKDIR /app

# نسخ ملفات التثبيت أولاً للاستفادة من الـ caching
COPY package.json ./
RUN npm install --legacy-peer-deps

# نسخ باقي ملفات المصدر الضرورية للبناء
COPY tsconfig.json ./
COPY app.json ./
COPY server ./server
COPY shared ./shared

# بناء السيرفر
RUN npm run server:build


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN apk add --no-cache ffmpeg

# نسخ الملفات المطلوبة للتشغيل من مرحلة البناء
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/index.js ./server/index.js
# إذا كان هناك ملفات تجميلية أو قوالب إضافية تحتاجها:
COPY --from=builder /app/server/templates ./server/templates
COPY privacy.html ./

EXPOSE 8080

CMD ["node", "server/index.js"]
