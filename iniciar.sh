#!/usr/bin/env bash
# =============================================================================
# Inicia o Sistema de Reservas de Salas (macOS e Linux)
#   ./iniciar.sh            -> modo desenvolvimento (recarrega ao editar o código)
#   ./iniciar.sh producao   -> modo produção (mais rápido)
# Para encerrar: Ctrl+C nesta janela e depois ./parar.sh
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

command -v node >/dev/null 2>&1 || { echo "[ERRO] Node.js não encontrado. Execute ./instalar.sh"; exit 1; }
[ -d node_modules ] || { echo "[AVISO] Dependências não instaladas. Executando ./instalar.sh..."; ./instalar.sh; }
[ -f .env ] || { echo "[ERRO] Arquivo .env não encontrado. Execute ./instalar.sh"; exit 1; }

MODO=local
[ -f .modo-banco ] && MODO=$(tr -d '[:space:]' < .modo-banco)

echo "[1/3] Iniciando o banco de dados ($MODO)..."
if [ "$MODO" = "docker" ]; then
  docker compose up -d banco
  sleep 3
else
  node scripts/banco-local.mjs start
fi

echo "[2/3] Aplicando atualizações do banco de dados (migrações)..."
npx prisma migrate deploy >/dev/null

# Acrescenta ao .env variáveis de versões novas (sem alterar as existentes).
node scripts/preparar-env.mjs >/dev/null

# Serviço de WhatsApp (se instalado): roda em segundo plano, log em .whatsapp.log.
# Na primeira vez, o QR Code aparece nesse log e em Configurações no sistema.
if [ -d servico-whatsapp/node_modules ]; then
  if (command -v lsof >/dev/null && lsof -ti tcp:3200 -sTCP:LISTEN >/dev/null 2>&1); then
    echo "[WhatsApp] Serviço já está em execução."
  else
    echo "[WhatsApp] Iniciando o serviço (log: .whatsapp.log; QR Code também em Configurações)..."
    nohup node servico-whatsapp/servidor.mjs > .whatsapp.log 2>&1 &
  fi
fi

echo "[3/3] Iniciando o sistema em http://localhost:3000"
echo "      Para encerrar: Ctrl+C e depois ./parar.sh"
# Abre o navegador depois de alguns segundos (se houver interface gráfica).
[ -n "${NAO_ABRIR_NAVEGADOR:-}" ] || ( sleep 12; (command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) || true ) >/dev/null 2>&1 &

if [ "${1:-}" = "producao" ]; then
  npm run build
  npm run start
else
  npm run dev
fi
