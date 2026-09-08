FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN apk add --no-cache ffmpeg

# نسخ كافة ملفات المشروع دفعة واحدة
COPY . .

# تثبيت الحزم والبناء مباشرة
RUN npm install --legacy-peer-deps
RUN npm run server:build

EXPOSE 8080

CMD ["node", "server/index.js"]
