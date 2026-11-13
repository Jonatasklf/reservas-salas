# =============================================================================
# Imagem de produção do Sistema de Reservas de Salas
# Usada por docker-compose.producao.yml (veja HOSPEDAGEM.md).
# =============================================================================
FROM node:22-bookworm-slim AS base
# O Prisma precisa do OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- dependências e build ---------------------------------------------------
FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build \
  # Binários do PostgreSQL embutido só servem para desenvolvimento local.
  && rm -rf node_modules/@embedded-postgres node_modules/embedded-postgres

# ---- imagem final -------------------------------------------------------------
FROM base AS final
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json /app/next.config.ts ./
# O cache do Next.js precisa ser gravável pelo usuário sem privilégios.
RUN mkdir -p .next/cache && chown -R node:node .next
USER node
EXPOSE 3000
# Aplica migrações pendentes e inicia o servidor.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3000"]
