FROM node:20-alpine AS base
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Instala dependências de sistema mínimas para pacotes nativos e timezone.
RUN apk add --no-cache tzdata ca-certificates curl

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npm run db:migrate && node server.js"]
