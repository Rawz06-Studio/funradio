FROM node:24-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --production

COPY server.js .

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["pnpm", "start"]
