#!/usr/bin/env bash
# Encerra o Sistema de Reservas de Salas (macOS e Linux).
cd "$(dirname "$0")"

echo "Encerrando o Sistema de Reservas de Salas..."

# 1) Servidor web na porta 3000
PIDS=$( (command -v lsof >/dev/null && lsof -ti tcp:3000 -sTCP:LISTEN) || (command -v fuser >/dev/null && fuser 3000/tcp 2>/dev/null) || true )
if [ -n "${PIDS// /}" ]; then
  kill $PIDS 2>/dev/null || true
  echo "[OK] Servidor web encerrado."
else
  echo "[--] O servidor web não estava em execução."
fi

# 2) Serviço de WhatsApp na porta 3200 (a sessão continua salva)
WPIDS=$( (command -v lsof >/dev/null && lsof -ti tcp:3200 -sTCP:LISTEN) || (command -v fuser >/dev/null && fuser 3200/tcp 2>/dev/null) || true )
if [ -n "${WPIDS// /}" ]; then
  kill $WPIDS 2>/dev/null || true
  echo "[OK] Serviço de WhatsApp encerrado (continua conectado para a próxima vez)."
fi

# 3) Banco de dados
MODO=local
[ -f .modo-banco ] && MODO=$(tr -d '[:space:]' < .modo-banco)
if [ "$MODO" = "docker" ]; then
  docker compose stop banco >/dev/null 2>&1 && echo "[OK] Banco de dados (Docker) encerrado. Os dados continuam salvos."
else
  node scripts/banco-local.mjs stop
  echo "     Os dados continuam salvos na pasta .banco-local"
fi
