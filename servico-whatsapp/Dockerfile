# Imagem do serviço de WhatsApp (whatsapp-web.js) para produção.
# Usa o Chromium do sistema (não baixa o Chrome do Puppeteer).
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-color-emoji ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY servidor.mjs ./
RUN mkdir -p /app/.sessao && chown -R node:node /app
USER node
EXPOSE 3200
CMD ["node", "servidor.mjs"]
