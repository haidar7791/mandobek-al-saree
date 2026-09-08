FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

COPY . .

RUN npm install --legacy-peer-deps
RUN npm run server:build

EXPOSE 8080

CMD ["node", "server/index.js"]
