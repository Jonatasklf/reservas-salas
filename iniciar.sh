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
